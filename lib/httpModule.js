/*
	Rest Query

	Copyright (c) 2014 - 2018 Cédric Ronvel

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

"use strict" ;



const restQuery = require( './restQuery.js' ) ;

const ErrorStatus = require( 'error-status' ) ;
const url = require( 'url' ) ;
const querystring = require( 'querystring' ) ;
const qs = require( 'qs-kit' ) ;
const path = require( 'path' ) ;
const stream = require( 'stream' ) ;
const server = require( 'server-kit' ) ;
//const string = require( 'string-kit' ) ;
const tree = require( 'tree-kit' ) ;
const rootsDb = require( 'roots-db' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;





/* HTTP request parser */



const httpModule = {} ;
module.exports = httpModule ;



httpModule.MAX_IN_MEMORY_SIZE = 10000 ;	// 10k max



httpModule.methods = [ 'options' , 'get' , 'post' , 'put' , 'patch' , 'delete' ] ;



httpModule.createServer = function() {
	var httpServer ;

	httpServer = server.createServer(
		{
			port: this.serverPort ,
			http: true ,
			multipart: true ,	// Activate multipart body in server-kit
			ws: true	// TMP
		} ,
		httpModule.requestHandler.bind( this )
	) ;

	httpServer.on( 'error' , ( error ) => {

		switch ( error.code ) {
			case 'EACCES' :
				log.fatal( "Can't open port %i: forbidden" , this.serverPort ) ;
				break ;
			case 'EADDRINUSE' :
				log.fatal( "Can't open port %i: already in use" , this.serverPort ) ;
				break ;
			default :
				log.fatal( error ) ;
		}

		process.exit( 1 ) ;
	} ) ;

	httpServer.on( 'listening' , () => {
		log.info( "HTTP server ready on port %i" , this.serverPort ) ;
	} ) ;

	this.httpServer = httpServer ;
} ;



httpModule.closeServer = function() {
	if ( ! this.httpServer ) { return ; }

	this.httpServer.close() ;
	delete this.httpServer ;

	log.info( "Destroying the HTTP server listening on port %i" , this.serverPort ) ;
} ;



/*
	httpRequestHandler( client )
	httpRequestHandler( httpRequest , httpResponse )
*/
httpModule.requestHandler = function( client , arg2 ) {
	if ( arg2 ) {
		client = {
			request: client ,
			response: arg2
		} ;
	}

	client.response.stats = {
		startTime: Date.now()
	} ;

	var context , location ;

	httpModule.parseRequest( client.request , ( error , message ) => {

		// First fix some header things
		client.response.setHeader( 'Content-Type' , 'application/json' ) ;
		client.response.setHeader( 'Trailer' , [
			'X-Request-Time' ,
			'X-Internal-Time'
		] ) ;

		// CORS
		if ( this.httpOptions.allowOrigin ) {
			if ( typeof this.httpOptions.allowOrigin === 'string' ) {
				client.response.setHeader( 'Access-Control-Allow-Origin' , this.httpOptions.allowOrigin ) ;
			}
			else if ( typeof this.httpOptions.allowOrigin === 'function' ) {
				client.response.setHeader( 'Access-Control-Allow-Origin' , this.httpOptions.allowOrigin( client.request.headers.origin ) ) ;
			}

			// Input
			client.response.setHeader( 'Access-Control-Allow-Methods' , 'OPTIONS, GET, PUT, PATCH, DELETE, POST, MOVE, LINK, UNLINK' ) ;
			client.response.setHeader( 'Access-Control-Allow-Headers' , [ 'Content-Type' , 'X-Token' ] ) ;

			// Exposed (to JS) output header
			client.response.setHeader( 'Access-Control-Expose-Headers' , [
				'Trailer' ,
				'X-Error-Type' ,
				'X-Error-Code' ,
				'X-Error-At' ,
				'X-Error-Message' ,
				//'X-User-Id' ,	// Still used?
				//'X-Token' ,	// Not server to client but client to server
				'X-Internal-Time' ,
				'X-Request-Time'
			] ) ;
		}

		// If an error occurs parsing the request, abort now
		if ( error ) { return httpModule.errorHandler.call( this , client.response , error ) ; }

		log.mon.requests ++ ;

		// Create the context for this request (performer, params, etc)
		context = {
			//performer: this.createPerformer( httpModule.getAuth( client.request , message ) ) ,
			performer: this.createPerformer( message.auth ) ,
			tier: message.tier ,
			pTier: message.pTier ,
			query: message.query
		} ;

		switch ( message.method ) {
			case 'options' :
				// We assume here a "pre-flight request" for checking CORS here...
				client.response.statusCode = 200 ;
				httpModule.endHandler.call( this , client.response ) ;
				break ;

			case 'get' :
				client.response.stats.internalStartTime = Date.now() ;

				this.root.get( message.path , context , ( getError , rawDocument , responseContext ) => {

					client.response.stats.internalEndTime = Date.now() ;

					if ( getError ) { return httpModule.errorHandler.call( this , client.response , getError ) ; }

					if ( rawDocument instanceof stream.Readable ) {
						// This is a file stream...
						if ( responseContext.output.meta ) {
							if ( responseContext.output.meta.contentType ) {
								client.response.setHeader( 'Content-Type' , responseContext.output.meta.contentType ) ;
							}

							if ( responseContext.output.meta.filename ) {
								client.response.setHeader( 'Content-Disposition' , 'inline;filename=' + querystring.escape( responseContext.output.meta.filename ) ) ;
							}
						}

						client.response.statusCode = 200 ;

						rawDocument.on( 'error' , streamError => {
							httpModule.errorHandler.call( this , client.response , streamError ) ;
						} ) ;

						rawDocument.pipe( client.response ) ;	// Simply pipe the file stream to the http response stream
						return ;
					}

					client.response.statusCode = 200 ;

					if ( responseContext.output.serializer ) {
						client.response.write( responseContext.output.serializer(
							rawDocument ,
							responseContext.output.serializerOpt1 ,
							responseContext.output.serializerOpt2
						) ) ;
					}
					else {
						client.response.write( restQuery.serializers.toJson( rawDocument ) ) ;
					}

					httpModule.endHandler.call( this , client.response ) ;
				} ) ;
				break ;

			case 'post' :
				// Methods do not always need a request body
				if ( ! message.data ) { message.data = {} ; }

				client.response.stats.internalStartTime = Date.now() ;

				this.root.post( message.path , message.data , message.attachmentStreams , context , ( postError , rawDocument , responseContext ) => {

					client.response.stats.internalEndTime = Date.now() ;

					if ( postError ) { return httpModule.errorHandler.call( this , client.response , postError ) ; }

					// POST can execute userland methods, missing args have to be expected...
					// /!\ Userland methods should probably be wrapped beforehand /!\
					if ( ! responseContext || typeof responseContext !== 'object' ) { responseContext = {} ; }
					if ( ! responseContext.output || typeof responseContext.output !== 'object' ) { responseContext.output = {} ; }

					client.response.statusCode = responseContext.output.httpStatus || 200 ;

					if ( client.response.statusCode === 201 && responseContext.document ) {
						location = this.serverAbsoluteUrl + client.request.url ;
						if ( location[ location.length - 1 ] !== '/' ) { location += '/' ; }
						location += responseContext.document._id ;
						client.response.setHeader( 'Location' , location ) ;
					}

					client.response.write( restQuery.serializers.toJson( rawDocument ) ) ;

					httpModule.endHandler.call( this , client.response ) ;
				} ) ;
				break ;

			case 'put' :
				if ( ! message.data ) { return httpModule.errorHandler.call( this , client.response , ErrorStatus.badRequest( 'PUT without body' ) ) ; }

				client.response.stats.internalStartTime = Date.now() ;

				this.root.put( message.path , message.data , message.attachmentStreams , context , ( putError , rawDocument , responseContext ) => {

					client.response.stats.internalEndTime = Date.now() ;

					if ( putError ) { return httpModule.errorHandler.call( this , client.response , putError ) ; }

					client.response.statusCode = responseContext.output.httpStatus || 200 ;

					//client.response.write( restQuery.serializers.toJson( rawDocument ) ) ;
					httpModule.endHandler.call( this , client.response ) ;
				} ) ;
				break ;

			case 'patch' :
				if ( ! message.data ) { return httpModule.errorHandler.call( this , client.response , ErrorStatus.badRequest( 'PATCH without body...' ) ) ; }

				client.response.stats.internalStartTime = Date.now() ;

				this.root.patch( message.path , message.data , message.attachmentStreams , context , ( patchError , rawDocument , responseContext ) => {

					client.response.stats.internalEndTime = Date.now() ;

					if ( patchError ) { return httpModule.errorHandler.call( this , client.response , patchError ) ; }

					client.response.statusCode = 200 ;

					//client.response.write( restQuery.serializers.toJson( rawDocument ) ) ;

					httpModule.endHandler.call( this , client.response ) ;
				} ) ;
				break ;

			case 'delete' :
				client.response.stats.internalStartTime = Date.now() ;

				this.root.delete( message.path , context , ( deleteError , rawDocument , responseContext ) => {

					client.response.stats.internalEndTime = Date.now() ;

					if ( deleteError ) { return httpModule.errorHandler.call( this , client.response , deleteError ) ; }

					client.response.statusCode = 200 ;

					//client.response.write( restQuery.serializers.toJson( rawDocument ) ) ;

					httpModule.endHandler.call( this , client.response ) ;
				} ) ;
				break ;

			default :
				httpModule.errorHandler.call( this , client.response , error ) ;
		}
	} ) ;
} ;



httpModule.errorHandler = function( httpResponse , error ) {
	var k ;

	if ( error instanceof ErrorStatus || typeof error.setHttpHeaders === 'function' ) {
		k = 'HTTP-' + error.httpStatus ;
		log.mon[ k ] = + log.mon[ k ] + 1 || 1 ;

		if ( error.type === 'internalError' ) { log.error( 'Http module received an Internal Error: %E' , error ) ; }
		else { log.verbose( 'Client handler error: %s' , error ) ; }

		error.setHttpHeaders( httpResponse ) ;
	}
	else {
		// All errors should be ErrorStatus here, or something upstream is not handled correctly.
		// Still, most errors here are user error, that should be correctly wrapped into ErrorStatus.
		log.mon['HTTP-500'] = + log.mon['HTTP-500'] + 1 || 1 ;
		log.error( 'Http module received a non-Error-Status: %E' , error ) ;

		ErrorStatus.internalError( error ).setHttpHeaders( httpResponse ) ;
	}

	// Do it better later...
	httpModule.endHandler( httpResponse ) ;
} ;



httpModule.endHandler = function( httpResponse ) {
	var moreHeaders ;

	if ( httpResponse.stats ) {
		moreHeaders = {} ;

		if ( httpResponse.stats.internalEndTime && httpResponse.stats.internalStartTime ) {
			moreHeaders['X-Internal-Time'] = ( httpResponse.stats.internalEndTime - httpResponse.stats.internalStartTime ) + 'ms' ;
		}

		moreHeaders['X-Request-Time'] = ( Date.now() - httpResponse.stats.startTime ) + 'ms' ;

		if ( httpResponse.headersSent ) {
			httpResponse.addTrailers( moreHeaders ) ;
		}
		else {
			httpResponse.writeHead( httpResponse.statusCode , moreHeaders ) ;
		}
	}

	httpResponse.end() ;
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
httpModule.parseRequest = function( httpRequest , callback ) {
	var length , message = {} , parsed , contentType , contentDisposition , result ;
	//deb( httpRequest ) ;

	// First, parse the URL
	//parsed = url.parse( httpRequest.url , true ) ;
	parsed = url.parse( httpRequest.url ) ;

	// Parse the query-string, right hand-side bracket support is on here!
	try {
		// /!\ NOTE: server-kit now supports query string parsing out of the box as a lazy property. Use client.query.
		parsed.query = qs.parse( parsed.query , { brackets: true , autoPush: true , keyPath: true } ) ;
	}
	catch ( error ) {
		callback( ErrorStatus.badRequest( "Bad query-string: " + error.message ) ) ;
		return ;
	}

	// Store the whole path
	try {
		message.path = restQuery.path.parse( parsed.pathname ) ;
	}
	catch ( error ) {
		callback( ErrorStatus.badRequest( error ) ) ;
		return ;
	}

	// Get the host without the port
	message.host = httpRequest.headers.host.split( ':' )[ 0 ] ;


	// Populate the method, lowercased
	message.method = httpRequest.method.toLowerCase() ;

	// POST can be substituted by anything
	if ( parsed.query.method && message.method === 'post' ) {
		message.method = parsed.query.method.toLowerCase() ;
		delete parsed.query.method ;
	}

	// If it is not a httpModule method, leave now with an error message
	if ( httpModule.methods.indexOf( message.method ) === -1 ) {
		callback( ErrorStatus.methodNotAllowed( "Method: '" + message.method + "' is not allowed." ) ) ;
		return ;
	}


	// Parse the auth part
	httpModule.parseAuth( httpRequest , parsed , message ) ;


	// Get the tier level
	if ( parsed.query.tier ) {
		message.tier = parseInt( parsed.query.tier , 10 ) ;
		delete parsed.query.tier ;
	}

	// Default to tier 3 if no valid tier given
	if ( ! message.tier || message.tier > 5 || message.tier < 0 ) { message.tier = 3 ; }


	// Same for the populate tier
	if ( parsed.query.pTier ) {
		message.pTier = parseInt( parsed.query.pTier , 10 ) ;
		delete parsed.query.pTier ;
	}

	// Default to tier 3 if no valid tier given
	if ( ! message.pTier || message.pTier > 5 || message.pTier < 0 ) { message.pTier = 3 ; }


	// Reference the remaining query's variable into the message
	message.query = restQuery.Node.parseQuery( parsed.query ) ;

	length = parseInt( httpRequest.headers['content-length'] , 10 ) ||
		httpRequest.headers['transfer-encoding'] === 'chunked' ? undefined : 0 ;


	// If there is no body, finish now
	if ( methodWithoutBody[ httpRequest.method ] || length === 0 ) { callback( undefined , message ) ; return ; }


	// We have a body to parse or to stream!


	// 'length' can still be undefined if transfer-encoding is 'chunked'
	if ( length && length > httpModule.MAX_IN_MEMORY_SIZE ) {
		callback( ErrorStatus.tooLarge( 'Body too large.' ) ) ;
		return ;
	}

	if ( httpRequest.multipart ) {
		// This is a multipart body: most probably document's related data + files

		log.debug( 'Multipart body received!' ) ;

		httpModule.parseMultipartBody( httpRequest.multipart , message , callback ) ;
	}
	else {
		// This is a regular single part body

		if ( ! httpRequest.headers['content-type'] ) {
			callback( ErrorStatus.badRequest( 'Body without Content-Type header.' ) ) ;
			return ;
		}

		contentType = httpModule.parseComplexHeader( httpRequest.headers['content-type'] ) ;

		if ( ! supportedDataContentType[ contentType.__primary ] ) {
			if ( message.path[ message.path.length - 1 ].type !== 'linkProperty' ) {
				callback( ErrorStatus.badRequest( 'This URL does not support this Content-Type.' ) ) ;
				return ;
			}

			if ( ! httpRequest.headers['content-disposition'] ) {
				callback( ErrorStatus.badRequest( 'This URL require a Content-Disposition header.' ) ) ;
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
			( error , body ) => {

				if ( error ) { callback( error ) ; return ; }
				callback( undefined , message ) ;
			}
		) ;
	}
} ;



/*
	Only 'header' and 'queryString' are supported ATM.
*/
httpModule.parseAuth = function( httpRequest , parsed , message ) {
	if ( httpRequest.headers['x-token'] ) {
		message.auth = {
			type: 'header' ,
			token: httpRequest.headers['x-token']
		} ;
	}
	else if ( parsed.query.token ) {
		message.auth = {
			type: 'queryString' ,
			token: parsed.query.token
		} ;

		delete parsed.query.token ;
	}

	log.debug( "Auth: %J" , message.auth ) ;
} ;



httpModule.parseMultipartBody = function( multipart , message , callback ) {
	var sent , terminated , waitCount = 0 , readyToSend = false , lastError ,
		remainingMaxSize = httpModule.MAX_IN_MEMORY_SIZE ;

	message.data = {} ;

	var sendBack = error => {
		if ( sent ) { return ; }

		if ( waitCount > 0 ) {
			readyToSend = true ;
			lastError = error ;
			return ;
		}

		sent = true ;

		if ( error ) { callback( error ) ; return ; }
		log.debug( "\n\n>>>>>>>>> sendBack() -- message.data: %s\n\n" , message.data ) ;

		callback( undefined , message ) ;
	} ;


	var wait = () => waitCount ++ ;


	var done = () => {
		waitCount -- ;
		if ( waitCount <= 0 && readyToSend ) { sendBack( lastError ) ; }
	} ;


	var terminate = ( error ) => {
		if ( terminated ) { return ; }
		terminated = true ;

		if ( message.streams ) { message.streams.end = true ; }

		if ( error ) { sendBack( error ) ; return ; }
		sendBack() ;
	} ;


	multipart.on( 'part' , ( part ) => {
		var headers ;

		log.debug( '\n\n>>>>>>>>>>>>>> New part! \n\n' ) ;

		part.on( 'header' , ( headers_ ) => {

			var contentDisposition , contentType ;

			log.debug( 'Part headers: %I' , headers_ ) ;
			headers = headers_ ;
			contentType = httpModule.parseComplexHeader( headers['content-type'] ) ;
			contentDisposition = httpModule.parseComplexHeader( headers['content-disposition'] ) ;
			log.debug( "contentType: %I" , contentType ) ;
			log.debug( "contentDisposition: %I" , contentDisposition ) ;

			if ( ! contentDisposition || ! contentDisposition.name ) {
				// /!\ For instance, we are only processing multipart/form-data, so we will drop that part /!\
				part.resume() ;
			}
			//else if ( headers['content-type'] === 'application/octet-stream' )	// not reliable
			//else if ( 'filename' in contentDisposition )	// Browser BLOB has filename even if we don't want...
			else if ( contentDisposition.filename ) {
				// ... so empty filename are processed like regular non-file data
				// This is a file!

				log.debug( "\n\n>>>>>>>>>>>>>> file part detected\n\n" ) ;

				httpModule.populateMessageAttachment( message , contentType , contentDisposition , part ) ;

				// Send back now, files are streamed
				sendBack() ;
			}
			else if ( sent ) {
				// Meta data should be send before any file, any trailing meta data are dropped
				part.resume() ;
			}
			else {
				wait() ;

				httpModule.getAllStreamContent( part , remainingMaxSize , ( error , content ) => {

					if ( error ) { terminate( error ) ; return ; }

					switch ( contentType ? supportedDataContentType[ contentType.__primary ] : 'text' ) {
						case 'json' :
							try {
								content = JSON.parse( content ) ;
							}
							catch ( error_ ) {
								// Bad JSON, drop it!
								log.error( "Part's content is not a valid JSON: %E" , error_ ) ;
								part.resume() ;
								return ;
							}
							break ;

						case 'queryString' :
							// Parse the query-string, (right hand-side bracket support is off)
							content = qs.parse( content ) ;
							break ;

						case 'text' :
							break ;

						default :
							callback( ErrorStatus.badRequest( 'Unsupported Content-Type header for data: ' + contentType.__primary ) ) ;
							return ;
					}

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
		part.on( 'data' , ( data ) {
			log.debug( 'Part data: %s' , data ) ;
		} ) ;
		*/
		part.on( 'end' , () => {
			log.debug( 'Part: End of part' ) ;
		} ) ;
	} ) ;

	multipart.on( 'finish' , () => {
		log.debug( 'Multipart: End of *ALL* parts' ) ;

		// No new attachment stream will be added
		if ( message.attachmentStreams ) { message.attachmentStreams.end() ; }

		sendBack() ;
	} ) ;
} ;



httpModule.populateMessageAttachment = function( message , contentType , contentDisposition , stream_ ) {
	if ( typeof contentType === 'string' ) { contentType = httpModule.parseComplexHeader( contentType ) ; }
	if ( typeof contentDisposition === 'string' ) { contentDisposition = httpModule.parseComplexHeader( contentDisposition ) ; }


	if (
		! contentDisposition ||
		! contentDisposition.name ||
		! contentDisposition.filename ||
		! ( contentDisposition.filename = path.basename( contentDisposition.filename ) )
	) {
		// Bad filename or empty form
		log.debug( "\n\n>>>>>>>>>>>>>> bad Content-Disposition: %J\n\n" , contentDisposition ) ;
		stream_.resume() ;
		return ErrorStatus.badRequest( "Missing a Content-Disposition with 'name' and 'filename' header." ) ;
	}

	if ( ! message.attachmentStreams ) {
		log.debug( "\n\n>>>>>>>>>>>>>> about to create attachment stream\n\n" ) ;
		message.attachmentStreams = rootsDb.AttachmentStreams.create() ;
	}

	message.attachmentStreams.addStream( stream_ , contentDisposition.name , {
		filename: contentDisposition.filename ,
		contentType: contentType.__primary
	} ) ;
} ;



httpModule.populateMessageData = function( message , contentType , stream_ , maxLength , callback ) {
	httpModule.getAllStreamContent( stream_ , maxLength , ( error , content ) => {

		if ( error ) { callback( error ) ; return ; }
		if ( ! content.length ) { callback() ; return ; }

		switch ( supportedDataContentType[ contentType.__primary ] ) {
			case 'json' :
				try {
					message.data = JSON.parse( content ) ;
				}
				catch ( error_ ) {
					callback( ErrorStatus.badRequest( 'Content is not a valid JSON' ) ) ;
					return ;
				}
				break ;

			case 'queryString' :
				// Parse the query-string, (right hand-side bracket support is off)
				message.data = qs.parse( content ) ;
				break ;

			default :
				callback( ErrorStatus.badRequest( 'Unsupported Content-Type header for data: ' + contentType.__primary ) ) ;
				return ;
		}

		callback() ;
	} ) ;
} ;



// Get the whole content of a request
httpModule.getAllStreamContent = function( stream_ , maxLength , callback ) {
	var chunks = [] , length = 0 ;

	var onData = data => {
		length += data.length ;

		if ( length > maxLength ) {
			stream_.pause() ;
			stream_.removeListener( 'data' , onData ) ;
			stream_.removeListener( 'end' , onEnd ) ;
			callback( ErrorStatus.tooLarge( 'Body too large.' ) ) ;
			return ;
		}

		chunks.push( data.toString() ) ;
	} ;

	var onEnd = () => {
		callback( undefined , chunks.join( '' ) ) ;
	} ;

	stream_.on( 'data' , onData ) ;
	stream_.on( 'end' , onEnd ) ;
} ;



// For instance, I don't know how special character are supposed to be escaped, if supported...
httpModule.parseComplexHeader = function( headerValue ) {
	var count = -1 , regexp , match , parsed = {} ;

	if ( typeof headerValue !== 'string' ) { return null ; }

	//regexp = / *([a-zA-Z0-9_\/+-]+)(?:=(?:"((?:\\"|[^"])*)"|([^";\s]*)))? *(;?) */g ;
	regexp = / *([^=;\s]+)(?:=(?:"((?:\\"|[^"])*)"|([^";\s]*)))? *(;?) */g ;

	while ( ( match = regexp.exec( headerValue ) ) !== null ) {
		count ++ ;

		//log.debug( "\n\nMATCH:\n" + match + "\n\n" ) ;

		if ( match[ 3 ] !== undefined ) { parsed[ match[ 1 ] ] = match[ 3 ] ; }
		else if ( match[ 2 ] !== undefined ) { parsed[ match[ 1 ] ] = match[ 2 ].replace( /\\"/g , '"' ) ; }
		else if ( count === 0 ) { parsed.__primary = match[ 1 ] ; }

		if ( ! match[ 4 ] ) { break ; }
	}

	return parsed ;
} ;


