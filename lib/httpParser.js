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
var string = require( 'string-kit' ) ;
var ErrorStatus = require( 'error-status' ) ;





			/* HTTP request parser */



var httpParser = {} ;
module.exports = httpParser ;



httpParser.MAX_DATA_SIZE = 100000 ;	// 100k



var deb = function( v ) { console.log( string.inspect( { style: 'color' , depth:2 } , v ) ) ; } ;	// jshint ignore:line



httpParser.methods = [ 'options' , 'get' , 'put' , 'patch' , 'delete' , 'post' ] ;



// Parse an HTTP request and return a message
httpParser.parseRequest = function parseRequest( httpRequest , callback )
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
	
	// If it is not a httpParser method, leave now with an error message
	if ( httpParser.methods.indexOf( message.method ) === -1 )
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
		if ( length && length > httpParser.MAX_DATA_SIZE )
		{
			callback( new Error( '[restQuery] parseRequest() MAX_DATA_SIZE reached' ) ) ;
			return ;
		}
		
		httpParser.getBody( httpRequest , length || httpParser.MAX_DATA_SIZE , function( error , body ) {
			
			//console.log( '>>> body: "' + body + '"' ) ;
			if ( error ) { callback( error ) ; return ; }
			
			try {
				message.data = JSON.parse( body ) ;
			}
			catch ( error ) {
				callback( new Error( '[restQuery] parseRequest() content is not valid JSON' ) ) ;
				return ;
			}
			
			callback( undefined , message ) ;
		} ) ;
		
		return ;
	}
	
	callback( undefined , message ) ;
} ;



// Get the whole body of a request
httpParser.getBody = function getBody( stream , maxLength , callback )
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


