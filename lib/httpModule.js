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
var querystring = require( 'querystring' ) ;
var qs = require( 'qs-kit' ) ;
var path = require( 'path' ) ;
var stream = require( 'stream' ) ;
var server = require( 'server-kit' ) ;
var string = require( 'string-kit' ) ;
var tree = require( 'tree-kit' ) ;
var rootsDb = require( 'roots-db' ) ;
var ErrorStatus = require( 'error-status' ) ;

var log = require( 'logfella' ).global.use( 'rest-query' ) ;

var restQuery = require( './restQuery.js' ) ;





			/* HTTP request parser */



var httpModule = {} ;
module.exports = httpModule ;



httpModule.MAX_IN_MEMORY_SIZE = 10000 ;	// 10k max



function noop() {}



httpModule.methods = [ 'options' , 'get' , 'post' , 'put' , 'patch' , 'delete' ] ;



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
				log.fatal( "Can't open port %i: forbidden" , self.serverPort ) ;
				break ;
			case 'EADDRINUSE' :
				log.fatal( "Can't open port %i: already in use" , self.serverPort ) ;
				break ;
			default :
				log.fatal( error ) ;
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
	var self = this , context , status , location ;
	
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
			client.response.setHeader( 'Access-Control-Expose-Headers' , [
				'X-Error-Type' ,
				'X-Error-Code' ,
				'X-Error-Message' ,
				'X-User-Id' ,	// Still used?
				'X-Token'
			] ) ;
		}
		
		// If an error occurs parsing the request, abort now
		if ( error ) { return httpModule.errorHandler.call( self , client.response , error ) ; }
		
		// Create the context for this request (performer, params, etc)
		context = {
			performer: self.createPerformer( httpModule.getAuth( client.request , message ) ) ,
			query: message.query
		} ;
		
		switch ( message.method )
		{
			case 'options' :
				// We assume here a "pre-flight request" for checking CORS here...
				client.response.writeHeader( 200 ) ;
				client.response.end() ;
				break ;
			
			case 'get' :
				self.root.get( message.path , context , function( error , rawDocument , details ) {
					if ( error ) { return httpModule.errorHandler.call( self , client.response , error ) ; }
					
					if ( rawDocument instanceof stream.Readable )
					{
						// This is a file stream...
						if ( details.contentType ) { client.response.setHeader( 'Content-Type' , details.contentType ) ; }
						if ( details.filename ) { client.response.setHeader( 'Content-Disposition' , 'inline;filename=' + querystring.escape( details.filename ) ) ; }
						client.response.writeHeader( 200 ) ;
						
						rawDocument.on( 'error' , function( error ) {
							httpModule.errorHandler.call( self , client.response , error ) ;
						} ) ;
						
						rawDocument.pipe( client.response ) ;	// Simply pipe the file stream to the http response stream
						return ;
					}
					
					client.response.writeHeader( 200 ) ;
					client.response.end( JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'post' :
				// Methods do not always need a request body
				//if ( ! message.data ) { return httpModule.errorHandler.call( self , client.response , new Error( 'No message body...' ) ) ; }
				if ( ! message.data ) { message.data = {} ; }
				
				self.root.post( message.path , message.data , message.attachmentStreams , context , function( error , rawDocument , details ) {
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
				
				self.root.put( message.path , message.data , message.attachmentStreams , context , function( error , rawDocument , details ) {
					if ( error ) { return httpModule.errorHandler.call( self , client.response , error ) ; }
					
					status = details.status || 200 ;
					
					client.response.writeHeader( status ) ;
					client.response.end() ;	// JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'patch' :
				if ( ! message.data ) { return httpModule.errorHandler.call( self , client.response , new Error( 'No message body...' ) ) ; }
				
				self.root.patch( message.path , message.data , message.attachmentStreams , context , function( error , rawDocument ) {
					if ( error ) { return httpModule.errorHandler.call( self , client.response , error ) ; }
					
					client.response.writeHeader( 200 ) ;
					client.response.end() ;	// JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'delete' :
				self.root.delete( message.path , context , function( error , rawDocument ) {
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
	
	log.verbose( 'Client handler error: %s' , error ) ;
	
	// Do it better later
	httpResponse.end() ;
} ;



httpModule.getAuth = function getAuth( request , message )
{
	if ( request.headers['x-token'] )
	{
		log.debug( "Auth by header: %J" , {
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
	var length , message = {} , parsed , contentType , contentDisposition , result ;
	//deb( httpRequest ) ;
	
	// First, parse the URL
	//parsed = url.parse( httpRequest.url , true ) ;
	parsed = url.parse( httpRequest.url ) ;
	
	// Parse the query-string, right hand-side bracket support is on here!
	parsed.query = qs.parse( parsed.query , { rightHandSideBrackets: true } ) ;
	
	// Store the whole path
	message.path = restQuery.Node.parsePath( parsed.pathname ) ;
	if ( message.path instanceof Error ) { callback( message.path ) ; return ; }
	
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
	message.query = restQuery.Node.parseQuery( parsed.query ) ;
	
	length = parseInt( httpRequest.headers['content-length'] , 10 ) ||
		httpRequest.headers['transfer-encoding'] === 'chunked' ? undefined : 0 ;
	
	
	// If there is no body, finish now
	if ( methodWithoutBody[ httpRequest.method ] || length === 0 ) { callback( undefined , message ) ; return ; }
	
	
	// We have a body to parse or to stream!
	
	
	// 'length' can still be undefined if transfer-encoding is 'chunked'
	if ( length && length > httpModule.MAX_IN_MEMORY_SIZE )
	{
		callback( ErrorStatus.tooLarge( { message: 'Body too large.' } ) ) ;
		return ;
	}
	
	if ( httpRequest.multipart )
	{
		// This is a multipart body: most probably document's related data + files
		
		log.debug( 'Multipart body received!' ) ;
		
		httpModule.parseMultipartBody( httpRequest.multipart , message , callback ) ;
	}
	else
	{
		// This is a regular single part body
		
		if ( ! httpRequest.headers['content-type'] )
		{
			callback( ErrorStatus.badRequest( { message: 'Body without Content-Type header.' } ) ) ;
			return ;
		}
		
		contentType = httpModule.parseComplexHeader( httpRequest.headers['content-type'] ) ;

		if ( ! supportedDataContentType[ contentType.__primary ] )
		{
			if ( message.path[ message.path.length - 1 ].type !== 'linkProperty' )
			{
				callback( ErrorStatus.badRequest( { message: 'This URL does not support this Content-Type.' } ) ) ;
				return ;
			}
			
			if ( ! httpRequest.headers['content-disposition'] )
			{
				callback( ErrorStatus.badRequest( { message: 'This URL require a Content-Disposition header.' } ) ) ;
				return ;
			}
			
			contentDisposition = httpModule.parseComplexHeader( httpRequest.headers['content-disposition'] ) ;
			
			// Force a Content-Disposition name equals to the last identifier
			contentDisposition.name = message.path[ message.path.length - 1 ].identifier ;
			
			result = httpModule.populateMessageAttachment( message , contentType , contentDisposition , httpRequest ) ;
			if ( result instanceof Error ) { callback( result ) ; return ; }
			
			// There will be no more stream, this is not a multipart body
			if ( message.attachmentStreams ) { message.attachmentStreams.end() ; }

			// Something else? Populate message.data with an empty object or not?
			// It will throw elsewhere if message.data does not exist ATM.
			message.data = {} ;
			
			callback( undefined , message ) ;
			return ;
		}
		
		// This is a regular document's data-only body
		
		// Normal message data body: they have a constraint in size, because everything is loaded in memory
		httpModule.populateMessageData(
			message ,
			contentType ,
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
		log.debug( "\n\n>>>>>>>>> sendBack() -- message.data: %s\n\n" , message.data ) ;
		
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
		
		log.debug( '\n\n>>>>>>>>>>>>>> New part! \n\n' ) ;
		
		part.on( 'header' , function( headers_ ) {
			
			var contentDisposition , contentType ;
			
			log.debug( 'Part headers: %I' , headers_ ) ;
			headers = headers_ ;
			contentType = httpModule.parseComplexHeader( headers['content-type'] ) ;
			contentDisposition = httpModule.parseComplexHeader( headers['content-disposition'] ) ;
			log.debug( "contentType: %I" , contentType ) ;
			log.debug( "contentDisposition: %I" , contentDisposition ) ;
			
			if ( ! contentDisposition || ! contentDisposition.name )
			{
				// /!\ For instance, we are only processing multipart/form-data, so we will drop that part /!\
				part.resume() ;
			}
			else if ( 'filename' in contentDisposition ) //|| headers['content-type'] === 'application/octet-stream' )	// not reliable
			{
				// This is a file!
				
				log.debug( "\n\n>>>>>>>>>>>>>> file part detected\n\n" ) ;
				
				httpModule.populateMessageAttachment( message , contentType , contentDisposition , part ) ;
				
				// Send back now, files are streamed
				sendBack() ;
			}
			else if ( sent )
			{
				// Meta data should be send before any file, any trailing meta data are dropped
				part.resume() ;
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
					log.debug( "httpModule.getAllStreamContent(), message.data:\n%J" , message.data ) ;
					
					done() ;
				} ) ;
			}
		} ) ;
		
		/*
		// Temp... Debug
		part.on( 'data' , function( data ) {
			log.debug( 'Part data: %s' , data ) ;
		} ) ;
		*/
		part.on( 'end' , function() {
			log.debug( 'Part: End of part' ) ;
		} ) ;
	} ) ;
	
	multipart.on( 'finish' , function() {
		log.debug( 'Multipart: End of *ALL* parts' ) ;
		
		// No new attachment stream will be added
		if ( message.attachmentStreams ) { message.attachmentStreams.end() ; }
		
		sendBack() ;
	} ) ;
} ;



httpModule.populateMessageAttachment = function populateMessageAttachment( message , contentType , contentDisposition , stream )
{
	if ( typeof contentType === 'string' ) { contentType = httpModule.parseComplexHeader( contentType ) ; }
	if ( typeof contentDisposition === 'string' ) { contentDisposition = httpModule.parseComplexHeader( contentDisposition ) ; }
	
	
	if (
		! contentDisposition ||
		! contentDisposition.name ||
		! contentDisposition.filename ||
		! ( contentDisposition.filename = path.basename( contentDisposition.filename ) )
	)
	{
		// Bad filename or empty form
		log.debug( "\n\n>>>>>>>>>>>>>> bad Content-Disposition: %J\n\n" , contentDisposition ) ;
		stream.resume() ;
		return ErrorStatus.badRequest( { message: "Missing a Content-Disposition with 'name' and 'filename' header." } ) ;
	}
	
	if ( ! message.attachmentStreams )
	{
		log.debug( "\n\n>>>>>>>>>>>>>> about to create attachment stream\n\n" ) ;
		message.attachmentStreams = rootsDb.AttachmentStreams.create() ;
	}
	
	message.attachmentStreams.addStream( stream , contentDisposition.name , {
		filename: contentDisposition.filename ,
		contentType: contentType.__primary
	} ) ;
} ;



httpModule.populateMessageData = function populateMessageData( message , contentType , stream , maxLength , callback )
{
	httpModule.getAllStreamContent( stream , maxLength , function( error , content ) {
		
		if ( error ) { callback( error ) ; return ; }
		if ( ! content.length ) { callback() ; return ; }
		
		switch ( supportedDataContentType[ contentType.__primary ] )
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
				// Parse the query-string, (right hand-side bracket support is off)
				message.data = qs.parse( content ) ;
				break ;
			
			default :
				callback( ErrorStatus.badRequest( { message: 'Unsupported Content-Type header for data: ' + contentType.__primary } ) ) ;
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
			callback( ErrorStatus.tooLarge( { message: 'Body too large.' } ) ) ;
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
	
	if ( typeof headerValue !== 'string' ) { return null ; }
	
	//regexp = / *([a-zA-Z0-9_\/+-]+)(?:=(?:"((?:\\"|[^"])*)"|([^";\s]*)))? *(;?) */g ;
	regexp = / *([^=;\s]+)(?:=(?:"((?:\\"|[^"])*)"|([^";\s]*)))? *(;?) */g ;
	
	while ( ( match = regexp.exec( headerValue ) ) !== null )
	{
		count ++ ;
		
		//log.debug( "\n\nMATCH:\n" + match + "\n\n" ) ;
		
		if ( match[ 3 ] !== undefined ) { parsed[ match[ 1 ] ] = match[ 3 ] ; }
		else if ( match[ 2 ] !== undefined ) { parsed[ match[ 1 ] ] = match[ 2 ].replace( /\\"/g , '"' ) ; }
		else if ( count === 0 ) { parsed.__primary = match[ 1 ] ; }
		
		if ( ! match[ 4 ] ) { break ; }
	}
	
	return parsed ;
} ;


