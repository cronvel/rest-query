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



httpModule.MAX_DATA_SIZE = 100000 ;	// 100k



var deb = function( v ) { console.log( string.inspect( { style: 'color' , depth:2 } , v ) ) ; } ;	// jshint ignore:line



httpModule.methods = [ 'options' , 'get' , 'put' , 'patch' , 'delete' , 'post' ] ;



httpModule.createServer = function httpCreateServer()
{
	var appServer ;
	
	appServer = server.createServer(
		this.serverPort ,
		{
			http: true ,
			ws: true	// TMP
		} ,
		httpModule.requestHandler.bind( this )
	) ;
} ;



httpModule.requestHandler = function httpRequestHandler( httpRequest , httpResponse )
{
	var self = this , performer ;
	
	httpModule.parseRequest( httpRequest , function( error , message ) {
		
		// First fix some header things
		httpResponse.setHeader( 'Content-Type' , 'application/json' ) ;
		
		// CORS
		if ( self.httpOptions.allowOrigin )
		{
			if ( typeof self.httpOptions.allowOrigin === 'string' )
			{
				httpResponse.setHeader( 'Access-Control-Allow-Origin' , self.httpOptions.allowOrigin ) ;
			}
			else if ( typeof self.httpOptions.allowOrigin === 'function' )
			{
				httpResponse.setHeader( 'Access-Control-Allow-Origin' , self.httpOptions.allowOrigin( httpRequest.headers.origin ) ) ;
			}
			
			httpResponse.setHeader( 'Access-Control-Allow-Methods' , 'OPTIONS, GET, PUT, PATCH, DELETE, POST' ) ;
			httpResponse.setHeader( 'Access-Control-Allow-Headers' , [ 'X-Token' , 'Content-Type' ] ) ;
		}
		
		// If an error occurs parsing the request, abort now
		if ( error ) { return httpModule.errorHandler.call( self , httpResponse , error ) ; }
		
		//# debug : console.log( string.inspect( { style: 'color' } , message ) ) ;
		
		// Temp:
		performer = restQuery.Performer.create( message ) ;
		
		switch ( message.method )
		{
			case 'options' :
				// We assume here a "pre-flight request" for checking CORS here...
				httpResponse.writeHeader( 200 ) ;
				httpResponse.end() ;
				break ;
			
			case 'get' :
				self.root.get( message.path , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { return httpModule.errorHandler.call( self , httpResponse , error ) ; }
					
					httpResponse.writeHeader( 200 ) ;
					httpResponse.end( JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'post' :
				// Is it necessary here?
				if ( ! message.data ) { return httpModule.errorHandler.call( self , httpResponse , new Error( 'No message body...' ) ) ; }
				
				self.root.post( message.path , message.data , { performer: performer } , function( error , rawDocument , details ) {
					if ( error ) { return httpModule.errorHandler.call( self , httpResponse , error ) ; }
					
					var status = details.status || 200 ;
					
					if ( status === 201 && rawDocument.id )
					{
						httpResponse.setHeader( 'Location' , self.serverAbsoluteUrl + httpRequest.url + '/' + rawDocument.id ) ;
					}
					
					httpResponse.writeHeader( status ) ;
					httpResponse.end( JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'put' :
				if ( ! message.data ) { return httpModule.errorHandler.call( self , httpResponse , new Error( 'No message body...' ) ) ; }
				
				self.root.put( message.path , message.data , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { return httpModule.errorHandler.call( self , httpResponse , error ) ; }
					
					httpResponse.writeHeader( 201 ) ;
					httpResponse.end() ;	// JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'patch' :
				if ( ! message.data ) { return httpModule.errorHandler.call( self , httpResponse , new Error( 'No message body...' ) ) ; }
				
				self.root.patch( message.path , message.data , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { return httpModule.errorHandler.call( self , httpResponse , error ) ; }
					
					httpResponse.writeHeader( 200 ) ;
					httpResponse.end() ;	// JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'delete' :
				self.root.delete( message.path , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { return httpModule.errorHandler.call( self , httpResponse , error ) ; }
					
					httpResponse.writeHeader( 200 ) ;
					httpResponse.end() ;	// JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			default:
				httpModule.errorHandler.call( self , httpResponse , error ) ;
		}
		
	} ) ;
} ;



httpModule.errorHandler = function httpErrorHandler( httpResponse , error )
{
	if ( error instanceof ErrorStatus ) { error.sendHttpHeaders( httpResponse ) ; }
	else { ErrorStatus.badRequest( { message: error.toString() } ).sendHttpHeaders( httpResponse ) ; }
	
	console.log( '[clientHandler] Error:' , error ) ;
	
	// Do it better later
	httpResponse.end() ;
} ;



// Parse an HTTP request and return a message
httpModule.parseRequest = function parseRequest( httpRequest , callback )
{
	var length , message = {} , parsed , splitted , token ;
	//deb( httpRequest ) ;
	
	// First, parse the URL
	parsed = url.parse( httpRequest.url , true ) ;
	//deb( parsed ) ;
	
	// Split the path to separate the extension part
	splitted = parsed.pathname.split( /\.(?!.*[\/.])/ ) ;
	message.path = splitted[ 0 ] ;
	message.type = splitted[ 1 ] || 'json' ;
	
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
	
	// Get the token, whatever the way...
	// TODO: get it from cookies, think of the priority, etc...
	token = httpRequest.headers['x-token'] || parsed.query.token ;
	delete parsed.query.token ;
	
	// Parse the token
	if ( token )
	{
		splitted = token.split( '-' ) ;
		message.userId = splitted[ 0 ] ;
		message.clientId = splitted[ 1 ] ;
		message.token = splitted[ 2 ] ;
	}
	
	
	// Reference the remaining query's variable into the message
	message.params = parsed.query ;
	
	length = parseInt( httpRequest.headers['content-length'] , 10 ) ||
		httpRequest.headers['transfer-encoding'] === 'chunked' ? undefined : 0 ;
	
	/* temp!
	message.headers = httpRequest.headers ;
	//*/
	
	if ( httpRequest.method !== 'get' && length !== 0 )
	{
		if ( length && length > httpModule.MAX_DATA_SIZE )
		{
			callback( new Error( '[restQuery] parseRequest() MAX_DATA_SIZE reached' ) ) ;
			return ;
		}
		
		httpModule.getBody( httpRequest , length || httpModule.MAX_DATA_SIZE , function( error , body ) {
			
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


