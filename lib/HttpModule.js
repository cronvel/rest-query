/*
	Rest Query

	Copyright (c) 2014 - 2021 Cédric Ronvel

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
const Promise = require( 'seventh' ) ;
//const url = require( 'url' ) ;
const qs = require( 'qs-kit' ) ;
const path = require( 'path' ) ;
const stream = require( 'stream' ) ;
const server = require( 'server-kit' ) ;
//const string = require( 'string-kit' ) ;
const tree = require( 'tree-kit' ) ;
const rootsDb = require( 'roots-db' ) ;

function noop() {}

const log = require( 'logfella' ).global.use( 'rest-query' ) ;



/*
	options:
		port: server port
		httpOptions: CORS pre-flight OPTIONS request
		serverAbsoluteUrl: absolute URL of the root of the API
		maxBodyDataSize: max size of the body, excluding file streaming
*/
function HttpModule( app , options = {} ) {
	this.app = app ;
	this.serverPort = options.serverPort ;
	this.httpOptions = options.httpOptions ;
	this.serverAbsoluteUrl = options.serverAbsoluteUrl ;
	this.maxBodyDataSize = options.maxBodyDataSize ;	// 10k max

	this.httpServer = null ;
}

module.exports = HttpModule ;



HttpModule.methods = new Set( [ 'options' , 'get' , 'post' , 'put' , 'patch' , 'delete' ] ) ;

// Query-string parser options: right hand-side bracket support is on here!
HttpModule.queryParserOptions = {
	brackets: true ,
	autoPush: true ,
	keyPath: true ,
	autoNumber: true ,
	restQueryFlatPrefixes: { "filter.": "filter" , ".": "filter" , "sort.": "sort" }
} ;



HttpModule.prototype.createServer = function() {
	if ( this.httpServer ) {
		log.error( "Server already created" ) ;
		return ;
	}

	this.httpServer = server.createServer(
		{
			port: this.serverPort ,
			http: true ,
			multipart: true ,	// Activate multipart body in server-kit
			queryParserOptions: HttpModule.queryParserOptions ,
			ws: true	// TMP
		} ,
		this.requestHandler.bind( this )
	) ;

	this.httpServer.on( 'error' , ( error ) => {
		switch ( error.code ) {
			case 'EACCES' :
				log.fatal( "Can't open port %i: forbidden" , this.serverPort ) ;
				break ;
			case 'EADDRINUSE' :
				log.fatal( "Can't open port %i: already in use" , this.serverPort ) ;
				break ;
			default :
				log.fatal( "%E" , error ) ;
		}

		process.exit( 1 ) ;
	} ) ;

	this.httpServer.once( 'listening' , () => {
		log.info( "HTTP server ready on port %i" , this.serverPort ) ;
	} ) ;
} ;



HttpModule.prototype.closeServer = function() {
	if ( ! this.httpServer ) { return ; }

	this.httpServer.close() ;
	this.httpServer = null ;

	log.info( "Destroying the HTTP server listening on port %i" , this.serverPort ) ;
} ;



/*
	httpRequestHandler( client )
*/
HttpModule.prototype.requestHandler = async function( client ) {
	client.response.stats = {
		startTime: Date.now()
	} ;

	var params , responseContext , location ;


	// Start sending back headers

	// CORS
	if ( this.httpOptions.allowOrigin ) {
		if ( typeof this.httpOptions.allowOrigin === 'string' ) {
			client.response.setHeader( 'access-control-allow-origin' , this.httpOptions.allowOrigin ) ;
		}
		else if ( typeof this.httpOptions.allowOrigin === 'function' ) {
			client.response.setHeader( 'access-control-allow-origin' , this.httpOptions.allowOrigin( client.request.headers.origin ) ) ;
		}

		// Input
		client.response.setHeader( 'access-control-allow-methods' , 'OPTIONS, GET, PUT, PATCH, DELETE, POST, MOVE, LINK, UNLINK' ) ;

		let allowHeaders = [
			'content-type' ,
			'digest' ,
			'x-token' ,
			'x-api-key' ,
			'x-upload-resume-offset' ,
			// Not sure:
			'content-disposition' ,
			'user-agent' ,
			'keep-alive' ,
			'trailer'
			// Maybe: DNT,X-CustomHeader,X-Requested-With,If-Modified-Since,Cache-Control
		] ;
		if ( this.app.debugGrant ) { allowHeaders.push( 'x-grant' ) ; }
		client.response.setHeader( 'access-control-allow-headers' , allowHeaders ) ;

		// Exposed (to JS) output header
		client.response.setHeader( 'access-control-expose-headers' , [
			'trailer' ,
			'digest' ,
			'date' ,	// seems to be useful for cache-control
			'x-error-type' ,
			'x-error-code' ,
			'x-error-at' ,
			'x-error-message' ,
			//'x-token' ,	// not server to client but client to server
			'x-internal-time' ,
			'x-request-time'
		] ) ;
	}


	try {
		var message = await this.parseRequest( client ) ;

		log.mon.requests ++ ;

		// Create the params for this request (performer, params, etc)
		params = {
			//performer: this.app.createPerformer( this.getAuth( client.request , message ) ) ,
			performer: this.app.createPerformer( message.auth ) ,
			access: message.access ,
			populateAccess: message.populateAccess ,
			query: message.query
		} ;

		switch ( message.method ) {
			case 'options' :
				// We assume here a "pre-flight request" for checking CORS here...
				client.response.setHeader( 'access-control-max-age' , 86400 ) ;	// 24h
				client.response.statusCode = 204 ;	// 204 No Content
				this.endHandler( client ) ;
				break ;

			case 'get' :
				client.response.stats.internalStartTime = Date.now() ;
				responseContext = await this.app.get( message.path , params ) ;
				client.response.stats.internalEndTime = Date.now() ;
				client.response.statusCode = 200 ;
				this.writeData( client , responseContext ) ;
				break ;

			case 'post' :
				// Methods do not always need a request body
				if ( ! message.data ) { message.data = {} ; }

				client.response.stats.internalStartTime = Date.now() ;
				responseContext = await this.app.post( message.path , message.data , message.attachmentStreams , params ) ;
				client.response.stats.internalEndTime = Date.now() ;

				// POST can execute userland methods, missing args have to be expected...
				// /!\ Userland methods should probably be wrapped beforehand /!\
				if ( ! responseContext || typeof responseContext !== 'object' ) { responseContext = {} ; }
				if ( ! responseContext.output || typeof responseContext.output !== 'object' ) { responseContext.output = {} ; }

				client.response.statusCode = responseContext.output.httpStatus ||
					( responseContext.output.data ? 200 : 204 ) ;

				if ( client.response.statusCode === 201 && responseContext.document ) {
					location = this.serverAbsoluteUrl + client.request.url ;
					if ( location[ location.length - 1 ] !== '/' ) { location += '/' ; }
					location += responseContext.document.getId() ;
					client.response.setHeader( 'location' , location ) ;
				}

				if ( responseContext.output.data ) {
					this.writeData( client , responseContext ) ;
				}
				else {
					this.endHandler( client ) ;
				}

				break ;

			case 'put' :
				if ( ! message.data ) { return this.errorHandler( client , ErrorStatus.badRequest( 'PUT without body' ) ) ; }

				client.response.stats.internalStartTime = Date.now() ;
				responseContext = await this.app.put( message.path , message.data , message.attachmentStreams , params ) ;
				client.response.stats.internalEndTime = Date.now() ;
				client.response.statusCode = responseContext.output.httpStatus || 204 ;
				//this.writeData( client , responseContext ) ;
				this.endHandler( client ) ;
				break ;

			case 'patch' :
				if ( ! message.data ) { return this.errorHandler( client , ErrorStatus.badRequest( 'PATCH without body...' ) ) ; }

				client.response.stats.internalStartTime = Date.now() ;
				responseContext = await this.app.patch( message.path , message.data , message.attachmentStreams , params ) ;
				client.response.stats.internalEndTime = Date.now() ;

				client.response.statusCode = responseContext.output.httpStatus ||
					( responseContext.output.data ? 200 : 204 ) ;

				if ( responseContext.output.data ) {
					this.writeData( client , responseContext ) ;
				}
				else {
					this.endHandler( client ) ;
				}

				break ;

			case 'delete' :
				client.response.stats.internalStartTime = Date.now() ;
				responseContext = await this.app.delete( message.path , params ) ;
				client.response.stats.internalEndTime = Date.now() ;
				client.response.statusCode = 204 ;
				//this.writeData( client , responseContext ) ;
				this.endHandler( client ) ;
				break ;

			default :
				throw ErrorStatus.methodNotAllowed( "Method not allowed: " + message.method ) ;
		}
	}
	catch ( error ) {
		this.errorHandler( client , error ) ;
	}
} ;



HttpModule.prototype.writeData = function( client , responseContext ) {
	var encodedFilename ;

	if ( ! responseContext.output.data ) {
		if ( client.response.statusCode === 200 ) {
			client.response.statusCode = 204 ;
		}

		this.endHandler( client ) ;
		return ;
	}

	// First fix some header things
	client.response.setHeader( 'content-type' , 'application/json' ) ;

	if ( client.response.chunkedEncoding ) {
		client.response.setHeader( 'trailer' , [
			'x-request-time' ,
			'x-internal-time'
		] ) ;
	}

	if ( responseContext.output.data instanceof stream.Readable ) {
		// This is a file stream...
		if ( responseContext.output.meta ) {
			if ( responseContext.output.meta.contentType ) {
				client.response.setHeader( 'content-type' , responseContext.output.meta.contentType ) ;
			}

			if ( responseContext.output.meta.filename ) {
				encodedFilename = encodeURIComponent( responseContext.output.meta.filename ) ;
				client.response.setHeader( 'content-disposition' , 'inline; filename="' + encodedFilename + "\"; filename*=UTF-8''" + encodedFilename ) ;
			}

			if ( responseContext.output.meta.hashType && responseContext.output.meta.hash ) {
				client.response.setHeader( 'digest' , HttpModule.stringifyDigest( responseContext.output.meta.hashType , responseContext.output.meta.hash ) ) ;
			}
		}

		responseContext.output.data.on( 'error' , streamError => {
			this.errorHandler( client , streamError ) ;
		} ) ;

		responseContext.output.data.pipe( client.response ) ;	// Simply pipe the file stream to the http response stream
		return ;
	}

	client.response.write( restQuery.misc.serializeContextData( responseContext ) ) ;

	this.endHandler( client ) ;
} ;



HttpModule.prototype.errorHandler = function( client , error ) {
	var k ;

	if ( error instanceof ErrorStatus || typeof error.setHttpHeaders === 'function' ) {
		k = 'HTTP-' + error.httpStatus ;
		log.mon[ k ] = + log.mon[ k ] + 1 || 1 ;

		if ( error.type === 'internalError' ) { log.error( 'Http module received an Internal Error: %E' , error ) ; }
		else { log.verbose( 'Client handler error: %s' , error ) ; }

		error.setHttpHeaders( client.response ) ;
	}
	else {
		// All errors should be ErrorStatus here, or something upstream is not handled correctly.
		// Still, most errors here are user error, that should be correctly wrapped into ErrorStatus.
		log.mon['HTTP-500'] = + log.mon['HTTP-500'] + 1 || 1 ;
		log.error( 'Http module received a non-Error-Status: %E' , error ) ;

		ErrorStatus.internalError( error ).setHttpHeaders( client.response ) ;
	}

	// Do it better later...
	this.endHandler( client ) ;
} ;



HttpModule.prototype.endHandler = function( client ) {
	if ( client.response.stats ) {
		let moreHeaders = {} ;

		if ( client.response.stats.internalEndTime && client.response.stats.internalStartTime ) {
			moreHeaders['x-internal-time'] = ( client.response.stats.internalEndTime - client.response.stats.internalStartTime ) + 'ms' ;
		}

		moreHeaders['x-request-time'] = ( Date.now() - client.response.stats.startTime ) + 'ms' ;

		if ( client.response.headersSent ) {
			if ( client.response.chunkedEncoding ) {
				client.response.addTrailers( moreHeaders ) ;
			}
		}
		else {
			client.response.writeHead( client.response.statusCode , moreHeaders ) ;
		}
	}

	client.response.end() ;

	if ( ! client.request.complete ) {
		/*
			We have to drop the query, however HTTP 1.1 is very bad at this job:

			- either we destroy the request now to avoid receiving load of data the we don't care about (e.g. files part of
			  multipart/form-data that are rejected for having bad content-type/binary content-type), BUT the browser
			  will act as if it doesn't receive our response, EVEN if everything is already sent by now, so now HTTP status code,
			  no header or whatever, just a "Connection Reset" error, alternatively, if we ignore data and stop accepting them,
			  the request will hang indefinitely (again, the response is already sent but ignored).

			- either we consume all the incoming data, the browser expects us to consume all data before it accepts reading
			  our response.
		*/

		// Force resume
		client.request.resume() ;
		// Also multipart may cause the stream to be paused multiple times, we immediately resume it anytime it's paused
		client.request.on( 'pause' , () => client.request.resume() ) ;
		// We consume data, but we drop them immediately
		client.request.on( 'data' , noop ) ;
		// Once the browser is done sending its sh*t, we destroy it (it's probably not useful at all by that time)
		client.request.once( 'end' , () => client.request.destroy() ) ;
	}
} ;



const METHOD_WITHOUT_BODY = {
	get: true ,
	head: true ,
	delete: true
} ;



const SUPPORTED_DATA_CONTENT_TYPE = {
	"application/json": "json" ,
	"text/json": "json" ,
	"application/x-www-form-urlencoded": "queryString"
} ;



// Parse an HTTP request and return a message
HttpModule.prototype.parseRequest = function( client ) {
	var length , message = {} , lastPathNode , contentType , contentDisposition , result , value ;

	// First, check that the query is OK
	if ( client.query instanceof Error ) {
		return Promise.reject( ErrorStatus.badRequest( "Bad query-string: " + client.query.message ) ) ;
	}

	message.query = {} ;

	// Store the whole path
	try {
		//message.path = restQuery.path.parse( parsed.pathname ) ;
		message.path = restQuery.path.parse( client.unicodePath ) ;
	}
	catch ( error ) {
		return Promise.reject( ErrorStatus.badRequest( error ) ) ;
	}

	// Get the host without the port
	message.host = client.hostname ;

	// Set method (lower-cased)
	message.method = client.method.toLowerCase() ;

	// POST can be substituted by anything
	if ( client.query.method && message.method === 'post' ) {
		message.method = client.query.method.toLowerCase() ;
	}

	// If it is not a HttpModule method, leave now with an error message
	if ( ! HttpModule.methods.has( message.method ) ) {
		return Promise.reject( ErrorStatus.methodNotAllowed( "Method: '" + message.method + "' is not allowed." ) ) ;
	}

	// Parse the auth part
	this.parseAuth( client , message ) ;


	// Get the access tags
	if ( client.query.access ) {
		message.access = client.query.access ;
	}

	// Same for the populate access
	if ( client.query.pAccess ) {
		message.populateAccess = client.query.pAccess ;
	}


	// Reference the remaining query's variable into the message
	if ( client.query.populate ) {
		if ( Array.isArray( client.query.populate ) ) { message.query.populate = client.query.populate ; }
		else if ( typeof client.query.populate === 'string' ) { message.query.populate = [ client.query.populate ] ; }
	}

	if ( client.query.deepPopulate && typeof client.query.deepPopulate === 'object' && ! Array.isArray( client.query.deepPopulate ) ) {
		message.query.deepPopulate = {} ;
		Object.entries( client.query.deepPopulate ).forEach( ( [ key , value_ ] ) => {
			if ( Array.isArray( value_ ) ) { message.query.deepPopulate[ key ] = value_ ; }
			else if ( typeof value_ === 'string' ) { message.query.deepPopulate[ key ] = [ value_ ] ; }
		} ) ;

		if ( client.query.depth ) { message.query.depth = + client.query.depth ; }
	}

	if ( client.query.skip ) {
		value = parseInt( client.query.skip , 10 ) ;
		if ( value ) { message.query.skip = value ; }
	}

	if ( client.query.limit ) {
		value = parseInt( client.query.limit , 10 ) ;
		if ( value ) { message.query.limit = value ; }
	}

	if ( typeof client.query.sort === 'object' ) {
		message.query.sort = client.query.sort ;
	}

	if ( typeof client.query.filter === 'object' ) {
		message.query.filter = client.query.filter ;
	}

	if ( typeof client.query.params === 'object' ) {
		message.query.params = client.query.params ;
	}

	if ( client.query.search ) {
		// Force a string here
		message.query.search = '' + client.query.search ;
	}


	length = parseInt( client.request.headers['content-length'] , 10 ) ||
		client.request.headers['transfer-encoding'] === 'chunked' ? undefined : 0 ;


	// If there is no body, finish now
	if ( METHOD_WITHOUT_BODY[ message.method ] || length === 0 ) {
		return Promise.resolve( message ) ;
	}


	// We have a body to parse or to stream!


	if ( client.request.multipart ) {
		// This is a multipart body: most probably document's related data + files
		//log.debug( 'Multipart body received!' ) ;
		return this.parseMultipartBody( client.request.multipart , message ) ;
	}

	// This is a regular single part body

	// 'length' can still be undefined if transfer-encoding is 'chunked'
	if ( length && length > this.maxBodyDataSize ) {
		return Promise.reject( ErrorStatus.tooLarge( 'Body too large.' ) ) ;
	}


	if ( ! client.request.headers['content-type'] ) {
		return Promise.reject( ErrorStatus.badRequest( 'Body without content-type header.' ) ) ;
	}

	lastPathNode = message.path[ message.path.length - 1 ] ;
	contentType = this.parseComplexHeader( client.request.headers['content-type'] ) ;

	if ( ! SUPPORTED_DATA_CONTENT_TYPE[ contentType.__primary ] ) {
		if ( ! lastPathNode || ( lastPathNode.type !== 'linkProperty' && lastPathNode.type !== 'method' ) ) {
			return Promise.reject( ErrorStatus.badRequest( 'This URL does not support this content-type.' ) ) ;
		}

		if ( ! client.request.headers['content-disposition'] ) {
			return Promise.reject( ErrorStatus.badRequest( 'This URL require a content-disposition header.' ) ) ;
		}

		contentDisposition = this.parseComplexHeader( client.request.headers['content-disposition'] ) ;

		// Force a content-disposition name equals to the last identifier
		contentDisposition.name = lastPathNode.identifier ;

		result = this.populateMessageAttachment( message , contentType , contentDisposition , client.request.headers , client.request ) ;
		if ( result instanceof Error ) { return Promise.reject( result ) ; }

		// There will be no more stream, this is not a multipart body
		if ( message.attachmentStreams ) { message.attachmentStreams.end() ; }

		// Something else? Populate message.data with an empty object or not?
		// It will throw elsewhere if message.data does not exist ATM.
		message.data = {} ;

		return Promise.resolve( message ) ;
	}

	// This is a regular document's data-only body

	// Normal message data body: they have a constraint in size, because everything is loaded in memory
	return this.populateMessageData( message , contentType , client.request , length || this.maxBodyDataSize )
		.then( () => message ) ;
} ;



/*
	Only 'header' and 'queryString' are supported ATM.
*/
HttpModule.prototype.parseAuth = function( client , message ) {
	// /!\ API KEYS are only supported for the SYSTEM pseudo-user ATM /!\

	if ( client.request.headers['x-api-key'] ) {
		message.auth = {
			type: 'header' ,
			apiKey: client.request.headers['x-api-key']
		} ;
	}
	else if ( client.query.apiKey ) {
		message.auth = {
			type: 'queryString' ,
			apiKey: client.query.apiKey
		} ;
	}
	else if ( client.request.headers['x-token'] ) {
		message.auth = {
			type: 'header' ,
			token: client.request.headers['x-token']
		} ;
	}
	else if ( client.query.token ) {
		message.auth = {
			type: 'queryString' ,
			token: client.query.token
		} ;
	}

	if ( client.request.headers['x-grant'] || client.query.grant ) {
		if ( ! message.auth ) { message.auth = {} ; }
		message.auth.grant = client.request.headers['x-grant'] || client.query.grant ;
	}

	//log.debug( "Auth: %J" , message.auth ) ;
} ;



/*
	/!\ IMPORTANT NOTE /!\
	All files MUST BE at the END of the multipart/form-data, because they are streamed in an AttachmentStreams.
	If any document-data should be received BEFORE files.
	Once the first file is reached, the HttpModule pass control to the RestQuery processing, and data-validation, hooks,
	saving to the DB will occurs immediately, that's why all document-data should be available immediately.
	Meanwhile, the files are streamed to the attachment back-end.

	It is possible that small files may support being sent before document-data, just because they are sent in the very
	same data chunk.
	It should not be relied upon.
	It just happens that the document-data are available at the same time, but it may not.

	Client-side, any HTML <form> should have the files at the very end of the form.
	If using the FormData Web API, files should be added at the end.
*/
HttpModule.prototype.parseMultipartBody = function( multipart , message ) {
	var multipartFinished , aborted = false , partProcessingCount = 0 , readyToSend = false , lastError ,
		remainingMaxSize = this.maxBodyDataSize ,
		promise = new Promise() ;

	message.data = {} ;

	var finalizeMultipart = error => {
		if ( multipartFinished ) { return ; }

		if ( partProcessingCount > 0 ) {
			readyToSend = true ;
			if ( error ) { lastError = error ; }
			return ;
		}

		multipartFinished = true ;
		//multipart.removeAllListeners() ;

		if ( error ) { promise.reject( error ) ; }
		else { promise.resolve( message ) ; }
	} ;


	var awaitPartProcessing = () => partProcessingCount ++ ;


	var partProcessingDone = () => {
		partProcessingCount -- ;
		if ( partProcessingCount <= 0 && readyToSend ) { finalizeMultipart( lastError ) ; }
	} ;


	var abort = ( error ) => {
		if ( aborted ) { return ; }
		aborted = true ;

		if ( message.streams ) { message.streams.end = true ; }

		if ( error ) { finalizeMultipart( error ) ; return ; }
		finalizeMultipart() ;
	} ;


	multipart.on( 'part' , ( part ) => {
		var headers ;

		part.on( 'header' , ( headers_ ) => {

			var contentDisposition , contentType ;

			headers = headers_ ;
			contentType = this.parseComplexHeader( headers['content-type'] ) ;
			contentDisposition = this.parseComplexHeader( headers['content-disposition'] ) ;

			if ( ! contentDisposition || ! contentDisposition.name ) {
				// /!\ For instance, we are only processing multipart/form-data, so we will drop that part /!\
				part.resume() ;
			}
			else if ( contentDisposition.filename ) {
				// This is a file (empty filename will be processed like regular non-file data)
				this.populateMessageAttachment( message , contentType , contentDisposition , headers , part ) ;

				// Finalize now, files are streamed, no document-data should be sent after this,
				// but more files could be sent.
				finalizeMultipart() ;
			}
			// application/octet-stream is not reliable for file detection, filename existence should be used instead.
			else if ( contentType?.__primary === 'application/octet-stream' ) {
				// application/octet-stream is not reliable for file detection, filename existence should be used instead.
				// However when a HTML form has a file input that the user have not used, an application/octet-stream
				// with a content-length of 0 will be sent.
				part.resume() ;
			}
			else if ( multipartFinished ) {
				// Meta data should be sent before any file, any trailing meta data are dropped
				part.resume() ;
			}
			else {
				awaitPartProcessing() ;

				this.getAllStreamContent( part , remainingMaxSize ).then(
					content => {
						switch ( contentType ? SUPPORTED_DATA_CONTENT_TYPE[ contentType.__primary ] : 'text' ) {
							case 'json' :
								try {
									content = JSON.parse( content ) ;
								}
								catch ( error_ ) {
									// Bad JSON, drop it!
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
								if ( contentType?.__primary === 'application/octet-stream' && content.length === 0 ) {
									// When a HTML form has a file input that the user has not used, an application/octet-stream
									// with a zero-length content will be sent.
									part.resume() ;
									partProcessingDone() ;
									return ;
								}

								partProcessingDone() ;
								abort( ErrorStatus.badRequest( 'Unsupported content-type header for data: ' + contentType.__primary ) ) ;
								return ;
						}

						// + 4 double-quote, 1 colon, 1 comma
						remainingMaxSize -= content.length + contentDisposition.name.length + 6 ;
						//message.data[ contentDisposition.name ] = content ;
						tree.path.set( message.data , contentDisposition.name , content ) ;

						partProcessingDone() ;
					} ,
					error => {
						abort( error ) ;
					}
				) ;
			}
		} ) ;

		part.on( 'error' , error => {
			log.debug( "Multipart part error: %E" , error ) ;
			abort( error ) ;
		} ) ;
	} ) ;

	multipart.on( 'error' , error => {
		log.debug( "Multipart error: %E" , error ) ;
		abort( error ) ;
	} ) ;

	multipart.once( 'finish' , () => {
		// No new attachment stream will be added
		if ( message.attachmentStreams ) { message.attachmentStreams.end() ; }

		finalizeMultipart() ;
	} ) ;

	return promise ;
} ;



HttpModule.prototype.populateMessageAttachment = function( message , contentType , contentDisposition , headers , stream_ ) {
	var streamEnded = false , digest , resumeOffset ;

	if ( typeof contentType === 'string' ) { contentType = this.parseComplexHeader( contentType ) ; }
	if ( typeof contentDisposition === 'string' ) { contentDisposition = this.parseComplexHeader( contentDisposition ) ; }


	if (
		! contentDisposition ||
		! contentDisposition.name ||
		! contentDisposition.filename ||
		! ( contentDisposition.filename = path.basename( contentDisposition.filename ) )
	) {
		// Bad filename or empty form
		stream_.resume() ;
		return ErrorStatus.badRequest( "Missing a content-disposition with 'name' and 'filename' header." ) ;
	}

	if ( headers['digest'] ) {
		digest = HttpModule.parseDigest( headers['digest'] ) ;
	}

	if ( headers['x-upload-resume-offset'] ) {
		resumeOffset = parseInt( headers['x-upload-resume-offset'] , 10 ) || undefined ;
	}

	if ( ! message.attachmentStreams ) {
		message.attachmentStreams = new rootsDb.AttachmentStreams() ;
	}

	// It looks like 'aborted' does not cause an 'end' event, and it causes a lot of trouble for some streams, like S3's upload.
	// We force an 'end' event to prevent those issues.
	stream_.once( 'end' , () => streamEnded = true ) ;
	stream_.once( 'aborted' , () => {
		if ( ! streamEnded ) {
			// Let some extra-time to receive an 'end' event
			setTimeout( () => {
				if ( ! streamEnded ) { stream_.emit( 'end' ) ; }
			} , 20 ) ;
		}
	} ) ;

	message.attachmentStreams.addStream(
		stream_ ,
		contentDisposition.name ,
		contentDisposition.setKey || '' ,	// /!\ Better API for that? /!\
		{
			filename: contentDisposition.filename ,
			contentType: contentType?.__primary ,
			hashType: digest?.hashType ,
			hash: digest?.hash
		} ,
		resumeOffset
	) ;
} ;



HttpModule.prototype.populateMessageData = function( message , contentType , stream_ , maxLength ) {
	return this.getAllStreamContent( stream_ , maxLength ).then( content => {
		if ( ! content.length ) { return ; }

		switch ( SUPPORTED_DATA_CONTENT_TYPE[ contentType?.__primary ] ) {
			case 'json' :
				try {
					message.data = JSON.parse( content ) ;
				}
				catch ( error_ ) {
					//log.error( "Not valid JSON: %s" , content ) ;
					throw ErrorStatus.badRequest( 'Content is not a valid JSON' ) ;
				}
				break ;

			case 'queryString' :
				// Parse the query-string, (right hand-side bracket support is off)
				message.data = qs.parse( content ) ;
				break ;

			default :
				throw ErrorStatus.badRequest( 'Unsupported content-type header for data: ' + contentType?.__primary ) ;
		}
	} ) ;
} ;



// We internally use the 'crypto' module for the hash type/algo
const HASH_TYPE_CRYPTO_TO_HEADER = {
	sha256: 'sha-256' ,
	sha512: 'sha-512'
} ;

// The reciprocal, reversing key and value
const HASH_TYPE_HEADER_TO_CRYPTO = {} ;
for ( let key in HASH_TYPE_CRYPTO_TO_HEADER ) { HASH_TYPE_HEADER_TO_CRYPTO[ HASH_TYPE_CRYPTO_TO_HEADER[ key ] ] = key ; }



HttpModule.parseDigest = digestHeader => {
	var offset = digestHeader.indexOf( '=' ) ;	// We can't use .split(), because there are = in the hash too

	if ( offset === -1 ) { return null ; }

	var hashType = digestHeader.slice( 0 , offset ) ;

	return {
		hashType: HASH_TYPE_HEADER_TO_CRYPTO[ hashType ] || hashType ,
		hash: digestHeader.slice( offset + 1 )
	} ;
} ;



HttpModule.stringifyDigest = ( hashType , hash ) => {
	if ( HASH_TYPE_CRYPTO_TO_HEADER[ hashType ] ) { hashType = HASH_TYPE_CRYPTO_TO_HEADER[ hashType ] ; }
	return hashType + '=' + hash ;
} ;



// Get the whole content of a request
HttpModule.prototype.getAllStreamContent = function( stream_ , maxLength ) {
	var promise = new Promise() ,
		chunks = [] , length = 0 ;

	var onData = data => {
		length += data.length ;

		if ( length > maxLength ) {
			stream_.pause() ;
			stream_.removeListener( 'data' , onData ) ;
			stream_.removeListener( 'end' , onEnd ) ;
			promise.reject( ErrorStatus.tooLarge( 'Body too large.' ) ) ;
			return ;
		}

		chunks.push( data.toString() ) ;
	} ;

	var onEnd = () => {
		promise.resolve( chunks.join( '' ) ) ;
	} ;

	stream_.on( 'data' , onData ) ;
	stream_.once( 'end' , onEnd ) ;

	return promise ;
} ;



// For instance, I don't know how special characters are supposed to be escaped, if supported...
// As for content-disposition's filename, it appears that it needs to be pure ASCII and provide an utf-8 variant urlencoded as filename*=UTF-8''%20%45%54
// /!\ Should probably be moved to Server-kit
HttpModule.prototype.parseComplexHeader = function( headerValue ) {
	var count = -1 , regexp , match , key , isStar , quotedValue , unquotedValue , semi , parsed = {} ;

	if ( typeof headerValue !== 'string' ) { return null ; }

	//regexp = / *([a-zA-Z0-9_\/+-]+)(?:=(?:"((?:\\"|[^"])*)"|([^";\s]*)))? *(;?) */g ;
	regexp = / *([^=;\s*]+)(\*)?(?:=(?:"((?:\\"|[^"])*)"|([^";\s]*)))? *(;?) */g ;

	while ( ( match = regexp.exec( headerValue ) ) !== null ) {
		[ , key , isStar , quotedValue , unquotedValue , semi ] = match ;
		count ++ ;

		if ( ! isStar && parsed[ key ] !== undefined ) { continue ; }

		if ( unquotedValue !== undefined ) {
			if ( isStar && ( match = unquotedValue.match( /^[Uu][Tt][Ff]-?8''(.*)/ ) ) !== null ) {
				unquotedValue = decodeURIComponent( match[ 1 ] ) ;
			}

			parsed[ key ] = unquotedValue ;
		}
		else if ( quotedValue !== undefined ) {
			parsed[ key ] = quotedValue.replace( /\\"/g , '"' ) ;
		}
		else if ( count === 0 ) {
			parsed.__primary = key ;
		}

		if ( ! semi ) { break ; }
	}

	return parsed ;
} ;

