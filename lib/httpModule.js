/*
	The Cedric's Swiss Knife (CSK) - CSK REST Query

	Copyright (c) 2015 Cédric Ronvel 
	
	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/



// Load modules
var url = require( 'url' ) ;
var server = require( 'server-kit' ) ;
var string = require( 'string-kit' ) ;
var ErrorStatus = require( 'error-status' ) ;

var restQuery = require( './restQuery.js' ) ;





			/* HTTP request parser */



var httpModule = {} ;
module.exports = httpModule ;



httpModule.MAX_IN_MEMORY_SIZE = 10000 ;	// 10k max, if it's not a multipart



var deb = function( v ) { console.log( string.inspect( { style: 'color' , depth:2 } , v ) ) ; } ;	// jshint ignore:line



httpModule.methods = [ 'options' , 'get' , 'put' , 'patch' , 'delete' , 'post' ] ;



httpModule.createServer = function httpCreateServer()
{
	var self = this , appServer ;
	
	appServer = server.createServer( {
			port: this.serverPort ,
			http: true ,
			multipart: true ,	// Activate multipart body in server-kit
			ws: true	// TMP
		} ,
		httpModule.requestHandler.bind( this )
	) ;
	
	appServer.on( 'error' , function( error ) {
		
		switch ( error.code )
		{
			case 'EACCES' :
				console.error( "Error -- Can't open port " + self.serverPort + ": forbidden" ) ;
				break ;
			case 'EADDRINUSE' :
				console.error( "Error -- Can't open port " + self.serverPort + ": already in use" ) ;
				break ;
			default :
				console.error( 'Error: ' , error ) ;
		}
		
		process.exit( 1 ) ;
	} ) ;
} ;



/*
	httpRequestHandler( client )
	httpRequestHandler( httpRequest , httpResponse )
*/
httpModule.requestHandler = function httpRequestHandler( client )
{
	var self = this , performer , status , location ;
	
	if ( arguments.length > 1 )
	{
		client = {
			request: arguments[ 0 ] ,
			response:  arguments[ 1 ]
		} ;
	}
	
	httpModule.parseRequest( client.request , function( error , message ) {
		
		// First fix some header things
		client.response.setHeader( 'Content-Type' , 'application/json' ) ;
		
		// CORS
		if ( self.httpOptions.allowOrigin )
		{
			if ( typeof self.httpOptions.allowOrigin === 'string' )
			{
				client.response.setHeader( 'Access-Control-Allow-Origin' , self.httpOptions.allowOrigin ) ;
			}
			else if ( typeof self.httpOptions.allowOrigin === 'function' )
			{
				client.response.setHeader( 'Access-Control-Allow-Origin' , self.httpOptions.allowOrigin( client.request.headers.origin ) ) ;
			}
			
			client.response.setHeader( 'Access-Control-Allow-Methods' , 'OPTIONS, GET, PUT, PATCH, DELETE, POST, MOVE' ) ;
			client.response.setHeader( 'Access-Control-Allow-Headers' , [ 'Content-Type' , 'X-Token' ] ) ;
		}
		
		// If an error occurs parsing the request, abort now
		if ( error ) { return httpModule.errorHandler.call( self , client.response , error ) ; }
		
		//# debug : console.log( string.inspect( { style: 'color' } , message ) ) ;
		
		// Create the performer for this request
		performer = self.createPerformer( httpModule.getAuth( client.request , message ) ) ;
		
		switch ( message.method )
		{
			case 'options' :
				// We assume here a "pre-flight request" for checking CORS here...
				client.response.writeHeader( 200 ) ;
				client.response.end() ;
				break ;
			
			case 'get' :
				self.root.get( message.path , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { return httpModule.errorHandler.call( self , client.response , error ) ; }
					
					client.response.writeHeader( 200 ) ;
					client.response.end( JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'post' :
				// Methods do not always need a request body
				//if ( ! message.data ) { return httpModule.errorHandler.call( self , client.response , new Error( 'No message body...' ) ) ; }
				if ( ! message.data ) { message.data = {} ; }
				
				self.root.post( message.path , message.data , { performer: performer } , function( error , rawDocument , details ) {
					if ( error ) { return httpModule.errorHandler.call( self , client.response , error ) ; }
					
					status = details.status || 200 ;
					
					if ( status === 201 && details.name )
					{
						location = self.serverAbsoluteUrl + client.request.url ;
						if ( location[ location.length - 1 ] !== '/' ) { location += '/' ; }
						location += details.name ;
						client.response.setHeader( 'Location' , location ) ;
					}
					
					client.response.writeHeader( status ) ;
					client.response.end( JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'put' :
				if ( ! message.data ) { return httpModule.errorHandler.call( self , client.response , new Error( 'No message body...' ) ) ; }
				
				self.root.put( message.path , message.data , { performer: performer } , function( error , rawDocument , details ) {
					if ( error ) { return httpModule.errorHandler.call( self , client.response , error ) ; }
					
					status = details.status || 200 ;
					
					client.response.writeHeader( status ) ;
					client.response.end() ;	// JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'patch' :
				if ( ! message.data ) { return httpModule.errorHandler.call( self , client.response , new Error( 'No message body...' ) ) ; }
				
				self.root.patch( message.path , message.data , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { return httpModule.errorHandler.call( self , client.response , error ) ; }
					
					client.response.writeHeader( 200 ) ;
					client.response.end() ;	// JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'delete' :
				self.root.delete( message.path , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { return httpModule.errorHandler.call( self , client.response , error ) ; }
					
					client.response.writeHeader( 200 ) ;
					client.response.end() ;	// JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			default:
				httpModule.errorHandler.call( self , client.response , error ) ;
		}
		
	} ) ;
} ;



httpModule.errorHandler = function httpErrorHandler( httpResponse , error )
{
	if ( error instanceof ErrorStatus || typeof error.sendHttpHeaders === 'function' )
	{
		error.sendHttpHeaders( httpResponse ) ;
	}
	else
	{
		ErrorStatus.badRequest( { message: error.toString() } ).sendHttpHeaders( httpResponse ) ;
	}
	
	console.log( '[clientHandler] Error:' , error ) ;
	
	// Do it better later
	httpResponse.end() ;
} ;



httpModule.getAuth = function getAuth( request , message )
{
	if ( request.headers['x-token'] )
	{
		console.log( "Auth by header:" , {
			type: 'header' ,
			token: request.headers['x-token']
		} ) ;
		return {
			type: 'header' ,
			token: request.headers['x-token']
		} ;
	}
	
	return null ;
} ;



var methodWithoutBody = {
	get: true ,
	head: true ,
	delete: true
} ;



var supportedDataContentType = {
	"application/json": "json" ,
	"text/json": "json"
} ;



// Parse an HTTP request and return a message
httpModule.parseRequest = function parseRequest( httpRequest , callback )
{
	var length , message = {} , parsed , endOfMetaData ;
	//deb( httpRequest ) ;
	
	// First, parse the URL
	parsed = url.parse( httpRequest.url , true ) ;
	//deb( parsed ) ;
	
	// Store the whole path
	message.path = parsed.pathname ;
	
	// Get the host without the port
	message.host = httpRequest.headers.host.split( ':' )[ 0 ] ;
	
	// Populate the method, lowercased
	if ( parsed.query.method ) { message.method = parsed.query.method.toLowerCase() ; delete parsed.query.method ; }
	else { message.method = httpRequest.method.toLowerCase() ; }
	
	// If it is not a httpModule method, leave now with an error message
	if ( httpModule.methods.indexOf( message.method ) === -1 )
	{
		callback( ErrorStatus.methodNotAllowed( "Method: '" + message.method + "' is not allowed." ) ) ;
		return ;
	}
	
	
	// Reference the remaining query's variable into the message
	message.params = parsed.query ;
	
	length = parseInt( httpRequest.headers['content-length'] , 10 ) ||
		httpRequest.headers['transfer-encoding'] === 'chunked' ? undefined : 0 ;
	
	
	if ( ! methodWithoutBody[ httpRequest.method ] && length !== 0 )
	{
		if ( length && length > httpModule.MAX_IN_MEMORY_SIZE )
		{
			callback( new Error( '[restQuery] parseRequest() MAX_IN_MEMORY_SIZE reached' ) ) ;
			return ;
		}
		
		if ( httpRequest.multipart )
		{
			console.error( '[restQuery] Multipart body received!' ) ;
			
			message.data = {} ;
			message.fileStream = {} ;
			
			httpRequest.multipart.on( 'part' , function( part ) {
				
				var headers , dropped ;
				
				console.error( 'New part!' ) ;
				
				part.on( 'header' , function( headers_ ) {
					var contentDisposition ;
					
					console.error( 'Part headers:' , headers_ ) ;
					headers = headers_ ;
					contentDisposition = httpModule.parseComplexHeader( headers['content-disposition'] ) ;
					console.error( "contentDisposition:" , contentDisposition ) ;
					
					if ( ! contentDisposition || ! contentDisposition.name )
					{
						dropped = true ;
					}
					else if ( contentDisposition.filename && headers['content-type'] === 'application/octet-stream' )
					{
						// This is a file!
						message.fileStream[ contentDisposition.name ] = part ;
						endOfMetaData = true ;
					}
					else if ( endOfMetaData )
					{
						dropped = true ;
					}
					else
					{
						
					}
					
					//message.
					
					part.on( 'data' , function( data ) {
						console.error( 'Part data: ' , data.toString() ) ;
						if ( dropped ) { return ; }
					} ) ;
					
				} ) ;
				
				part.on( 'end' , function() {
					console.error( 'Part: End of part\n' ) ;
				} ) ;
				
			} ) ;
			
			httpRequest.multipart.on( 'finish' , function() {
				console.error( 'Multipart: End of *ALL* parts' ) ;
				
				// To do...
				callback( undefined , message ) ;
			} ) ;
		}
		else
		{
			if ( ! httpRequest.headers['content-type'] )
			{
				callback( ErrorStatus.badRequest( { message: 'Body without Content-Type header.' } ) ) ;
				return ;
			}
			else if ( ! supportedDataContentType[ httpRequest.headers['content-type'] ] )
			{
				callback( ErrorStatus.badRequest( { message: 'Unsupported Content-Type header for data: ' + httpRequest.headers['content-type'] } ) ) ;
				return ;
			}
			
			// Normal message data body: they have a constraint in size, because everything is loaded in memory
			httpModule.populateMessageData(
				message ,
				httpRequest.headers['content-type'] ,
				httpRequest ,
				length || httpModule.MAX_IN_MEMORY_SIZE ,
				function( error , body ) {
					
					if ( error ) { callback( error ) ; return ; }
					callback( undefined , message ) ;
				}
			) ;
		}
		
		return ;
	}
	
	callback( undefined , message ) ;
} ;



httpModule.populateMessageData = function populateMessageData( message , contentType , stream , maxLength , callback )
{
	// Normal, non-multipart body: they have a constraint in size, because every thing is loaded in memory
	httpModule.getAllStreamContent( stream , maxLength , function( error , body ) {
		
		//console.log( '>>> body: "' + body + '"' ) ;
		if ( error ) { callback( error ) ; return ; }
		if ( ! body.length ) { callback() ; return ; }
		
		switch ( supportedDataContentType[ contentType ] )
		{
			case 'json' :
				try {
					message.data = JSON.parse( body ) ;
				}
				catch ( error ) {
					callback( new Error( '[restQuery] parseRequest() content is not a valid JSON' ) ) ;
					return ;
				}
				break ;
			
			default :
				callback( ErrorStatus.badRequest( { message: 'Unsupported Content-Type header for data: ' + contentType } ) ) ;
				return ;
		}
		
		callback() ;
	} ) ;
} ;



// Get the whole body of a request
httpModule.getAllStreamContent = function getAllStreamContent( stream , maxLength , callback )
{
	var chunks = [] , length = 0 ;
	
	var onData = function( data ) {
		
		length += data.length ;
		
		if ( length > maxLength )
		{
			stream.pause() ;
			stream.removeListener( 'data' , onData ) ;
			stream.removeListener( 'end' , onEnd ) ;
			callback( new Error( 'HTTP body too large' ) ) ;
			return ;
		}
		
		chunks.push( data.toString() ) ;
	} ;
	
	var onEnd = function() {
		callback( undefined , chunks.join( '' ) ) ;
	} ;
	
	stream.on( 'data' , onData ) ;
	stream.on( 'end' , onEnd ) ;
} ;



// For instance, I don't know how special character are supposed to be escaped, if supported...
httpModule.parseComplexHeader = function parseComplexHeader( headerValue )
{
	var count = -1 , regexp , match , parsed = {} ;
	
	if ( ! headerValue ) { return null ; }
	
	regexp = / *([a-zA-Z0-9_-]+)(?:=(?:"((?:\\"|[^"])*)"|([^";\s]*)))? *(;?) */g ;
	
	while ( ( match = regexp.exec( headerValue ) ) !== null )
	{
		count ++ ;
		
		//console.error( "\n\nMATCH:\n" , match , "\n\n" ) ;
		
		if ( match[ 3 ] ) { parsed[ match[ 1 ] ] = match[ 3 ] ; }
		else if ( match[ 2 ] ) { parsed[ match[ 1 ] ] = match[ 2 ].replace( /\\"/g , '"' ) ; }
		else if ( count === 0 ) { parsed.__primary = match[ 1 ] ; }
		
		if ( ! match[ 4 ] ) { break ; }
	}
	
	return parsed ;
} ;


