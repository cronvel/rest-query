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



httpModule.MAX_NON_MULTIPART_SIZE = 10000 ;	// 10k max, if it's not a multipart



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
	
	/* This is now obsolete: RestQuery is a service that only return data, not HTML
	// Split the path to separate the extension part
	splitted = parsed.pathname.split( /\.(?!.*[\/.])/ ) ;
	message.path = splitted[ 0 ] ;
	message.type = splitted[ 1 ] || 'json' ;
	//*/
	
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
		if ( length && length > httpModule.MAX_NON_MULTIPART_SIZE )
		{
			callback( new Error( '[restQuery] parseRequest() MAX_NON_MULTIPART_SIZE reached' ) ) ;
			return ;
		}
		
		if ( httpRequest.multipart )
		{
			console.error( '[restQuery] Multipart body received!' ) ;
			
			httpRequest.multipart.on( 'part' , function( part ) {
				
				var headers ;
				
				console.error( 'New part!' ) ;
				
				part.on( 'header' , function( headers_ ) {
					var contentDisposition ;
					
					console.error( 'Part headers:' , headers_ ) ;
					headers = headers_ ;
					contentDisposition = httpModule.parseComplexHeader( headers['content-disposition'] ) ;
					console.error( "contentDisposition:" , contentDisposition ) ;
					//message.
				} ) ;
				
				part.on( 'data' , function( data ) {
					console.error( 'Part data: ' , data.toString() ) ;
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
			// Normal, non-multipart body: they have a constraint in size, because every thing is loaded in memory
			httpModule.getBody( httpRequest , length || httpModule.MAX_NON_MULTIPART_SIZE , function( error , body ) {
				
				//console.log( '>>> body: "' + body + '"' ) ;
				if ( error ) { callback( error ) ; return ; }
				
				if ( body.length )
				{
					try {
						message.data = JSON.parse( body ) ;
					}
					catch ( error ) {
						callback( new Error( '[restQuery] parseRequest() content is not a valid JSON' ) ) ;
						return ;
					}
				}
				
				callback( undefined , message ) ;
			} ) ;
		}
		
		return ;
	}
	
	callback( undefined , message ) ;
} ;



// Get the whole body of a request
httpModule.getBody = function getBody( stream , maxLength , callback )
{
	var body = '' , length = 0 ;
	
	var onData = function( chunk ) {
		
		length += chunk.length ;
		
		if ( length > maxLength )
		{
			stream.pause() ;
			stream.removeListener( 'data' , onData ) ;
			stream.removeListener( 'end' , onEnd ) ;
			callback( new Error( 'HTTP body too large' ) ) ;
			return ;
		}
		
		body += chunk.toString() ;
	} ;
	
	var onEnd = function() {
		callback( undefined , body ) ;
	} ;
	
	stream.on( 'data' , onData ) ;
	stream.on( 'end' , onEnd ) ;
} ;



// A very naive Content-Disposition header parser, yet it should works in 99.9% of cases
httpModule.parseComplexHeader = function parseComplexHeader( header )
{
	var i , iMax , parts , match , parsed = {} ;
	
	parts = header.split( /; */ ) ;
	iMax = parts.length ;
	
	for ( i = 0 ; i < iMax ; i ++ )
	{
		match = parts[ i ].match( /^([a-zA-Z0-9_-]+)(?:="([^"]*)")?$/ ) ;
		
		if ( ! match ) { continue ; }
		
		if ( match[ 2 ] ) { parsed[ match[ 1 ] ] = match[ 2 ] ; }
		else if ( i === 0 ) { parsed.__type = match[ 1 ] ; }
	}
	
	return parsed ;
} ;


