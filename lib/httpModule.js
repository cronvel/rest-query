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
var qs = require( 'qs' ) ;
var path = require( 'path' ) ;
var server = require( 'server-kit' ) ;
var string = require( 'string-kit' ) ;
var tree = require( 'tree-kit' ) ;
var rootsDb = require( 'roots-db' ) ;
var ErrorStatus = require( 'error-status' ) ;

var restQuery = require( './restQuery.js' ) ;





			/* HTTP request parser */



var httpModule = {} ;
module.exports = httpModule ;



httpModule.MAX_IN_MEMORY_SIZE = 10000 ;	// 10k max



var deb = function( v ) { console.log( string.inspect( { style: 'color' , depth:2 } , v ) ) ; } ;	// jshint ignore:line

function noop() {}



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
				
				self.root.post( message.path , message.data , message.attachmentStreams , { performer: performer } , function( error , rawDocument , details ) {
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
				
				self.root.put( message.path , message.data , message.attachmentStreams , { performer: performer } , function( error , rawDocument , details ) {
					if ( error ) { return httpModule.errorHandler.call( self , client.response , error ) ; }
					
					status = details.status || 200 ;
					
					client.response.writeHeader( status ) ;
					client.response.end() ;	// JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'patch' :
				if ( ! message.data ) { return httpModule.errorHandler.call( self , client.response , new Error( 'No message body...' ) ) ; }
				
				self.root.patch( message.path , message.data , message.attachmentStreams , { performer: performer } , function( error , rawDocument ) {
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
	"text/json": "json" ,
	"application/x-www-form-urlencoded": "queryString"
} ;



// Parse an HTTP request and return a message
httpModule.parseRequest = function parseRequest( httpRequest , callback )
{
	var length , message = {} , parsed ;
	//deb( httpRequest ) ;
	
	// First, parse the URL
	parsed = url.parse( httpRequest.url , true ) ;
	//deb( parsed ) ;
	
	// Store the whole path
	message.path = parsed.pathname ;
	
	// Get the host without the port
	message.host = httpRequest.headers.host.split( ':' )[ 0 ] ;
	
	// Populate the method, lowercased
	message.method = httpRequest.method.toLowerCase() ;
	
	if ( parsed.query.method && message.method === 'post' )		// POST can be substituted by anything
	{
		message.method = parsed.query.method.toLowerCase() ;
		delete parsed.query.method ;
	}
	
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
	
	
	// If there is no body, finish now
	if ( methodWithoutBody[ httpRequest.method ] || length === 0 ) { callback( undefined , message ) ; return ; }
	
	
	// We have a body to parse or to stream!
	
	
	// 'length' can still be undefined if transfer-encoding is 'chunked'
	if ( length && length > httpModule.MAX_IN_MEMORY_SIZE )
	{
		callback( new Error( '[restQuery] parseRequest() MAX_IN_MEMORY_SIZE reached' ) ) ;
		return ;
	}
	
	if ( httpRequest.multipart )
	{
		// This is a multipart body: most probably document's related data + files
		
		console.error( '[restQuery] Multipart body received!' ) ;
		
		httpModule.parseMultipartBody( httpRequest.multipart , message , callback ) ;
	}
	else
	{
		// This is a regular document's data-only body
		
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
} ;


	
httpModule.parseMultipartBody = function parseMultipartBody( multipart , message , callback )
{
	var self = this , sent , terminated , waitCount = 0 , readyToSend ,
		remainingMaxSize = httpModule.MAX_IN_MEMORY_SIZE ;
	
	message.data = {} ;
	
	
	var sendBack = function sendBack( error ) {
		
		if ( sent ) { return ; }
		
		if ( waitCount > 0 )
		{
			readyToSend = arguments ;
			return ;
		}
		
		sent = true ;
		
		if ( error ) { callback( error ) ; return ; }
		console.error( "\n\n>>>>>>>>> sendBack() -- message.data:" , message.data , "\n\n" ) ;
		
		callback( undefined , message ) ;
	} ;
	
	
	var wait = function wait() { waitCount ++ ; } ;
	
	
	var done = function done()
	{
		waitCount -- ;
		if ( waitCount <= 0 && readyToSend ) { sendBack.apply( self , readyToSend ) ; }
	} ;
	
	
	var terminate = function terminate( error ) {
		
		if ( terminated ) { return ; }
		terminated = true ;
		
		if ( message.streams ) { message.streams.end = true ; }
		
		if ( error ) { sendBack( error ) ; return ; }
		sendBack() ;
	} ;
	
	
	multipart.on( 'part' , function( part ) {
		
		var headers ;
		
		console.error( '\n\n>>>>>>>>>>>>>> New part! \n\n' ) ;
		
		part.on( 'header' , function( headers_ ) {
			
			var contentDisposition ;
			
			console.error( 'Part headers:' , headers_ ) ;
			headers = headers_ ;
			contentDisposition = httpModule.parseComplexHeader( headers['content-disposition'] ) ;
			console.error( "contentDisposition:" , contentDisposition ) ;
			
			if ( ! contentDisposition || ! contentDisposition.name )
			{
				// /!\ For instance, we are only processing multipart/form-data, so we will drop that part /!\
				part.resume() ;
				//part.on( 'data' , noop ) ;
			}
			else if ( contentDisposition.filename ) //|| headers['content-type'] === 'application/octet-stream' )	// not reliable
			{
				// This is a file!
				
				console.error( "\n\n>>>>>>>>>>>>>> file part detected\n\n" ) ;
				if ( contentDisposition.filename ) { contentDisposition.filename = path.basename( contentDisposition.filename ) ; }
				
				if ( ! contentDisposition.filename )
				{
					// Bad filename
					console.error( "\n\n>>>>>>>>>>>>>> bad filename" , contentDisposition.filename , "\n\n" ) ;
					part.resume() ;
					//part.on( 'data' , noop ) ;
					return ;
				}
				
				if ( ! message.attachmentStreams )
				{
					console.error( "\n\n>>>>>>>>>>>>>> about to create attachment stream\n\n" ) ;
					message.attachmentStreams = rootsDb.AttachmentStreams.create() ;
				}
				
				message.attachmentStreams.addStream( part , contentDisposition.name , {
					filename: contentDisposition.filename ,
					contentType: headers['content-type']
				} ) ;
				
				// Send back now, files are streamed
				sendBack() ;
			}
			else if ( sent )
			{
				// Meta data should be send before any file, any trailing meta data are dropped
				part.resume() ;
				//part.on( 'data' , noop ) ;
			}
			else
			{
				wait() ;
				
				httpModule.getAllStreamContent( part , remainingMaxSize , function( error , content ) {
					
					if ( error ) { terminate( error ) ; return ; }
					
					// + 4 double-quote, 1 colon, 1 comma
					remainingMaxSize -= content.length + contentDisposition.name.length + 6 ;
					//message.data[ contentDisposition.name ] = content ;
					tree.path.set( message.data , contentDisposition.name , content ) ;
					console.error( "httpModule.getAllStreamContent(), message.data:\n" , message.data ) ;
					
					done() ;
				} ) ;
			}
		} ) ;
		
		/*
		// Temp... Debug
		part.on( 'data' , function( data ) {
			console.error( 'Part data: ' , data.toString() ) ;
		} ) ;
		*/
		part.on( 'end' , function() {
			console.error( 'Part: End of part' ) ;
		} ) ;
	} ) ;
	
	multipart.on( 'finish' , function() {
		console.error( 'Multipart: End of *ALL* parts' ) ;
		
		// No new attachment stream will be added
		if ( message.attachmentStreams ) { message.attachmentStreams.end() ; }
		
		sendBack() ;
	} ) ;
} ;



httpModule.populateMessageData = function populateMessageData( message , contentType , stream , maxLength , callback )
{
	httpModule.getAllStreamContent( stream , maxLength , function( error , content ) {
		
		//console.log( '>>> content: "' + content + '"' ) ;
		if ( error ) { callback( error ) ; return ; }
		if ( ! content.length ) { callback() ; return ; }
		
		switch ( supportedDataContentType[ contentType ] )
		{
			case 'json' :
				try {
					message.data = JSON.parse( content ) ;
				}
				catch ( error ) {
					callback( new Error( '[restQuery] parseRequest() content is not a valid JSON' ) ) ;
					return ;
				}
				break ;
			
			case 'queryString' :
				
// /!\ replace that with my own function, supporting dot separated field instead of PHP's array notation /!\
				
				message.data = qs.parse( content ) ;
				break ;
			
			default :
				callback( ErrorStatus.badRequest( { message: 'Unsupported Content-Type header for data: ' + contentType } ) ) ;
				return ;
		}
		
		callback() ;
	} ) ;
} ;



// Get the whole content of a request
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
			callback( new Error( 'Content too large' ) ) ;
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


