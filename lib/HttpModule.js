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
	restQueryFilter: 'filter' ,
	autoNumber: true
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
		client.response.setHeader( 'access-control-allow-headers' , [ 'content-type' , 'x-token' , 'digest' ] ) ;

		// Exposed (to JS) output header
		client.response.setHeader( 'access-control-expose-headers' , [
			'trailer' ,
			'digest' ,
			'x-error-type' ,
			'x-error-code' ,
			'x-error-at' ,
			'x-error-message' ,
			//'x-user-id' ,	// Still used?
			//'x-token' ,	// Not server to client but client to server
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
				client.response.statusCode = 200 ;
				this.endHandler( client.response ) ;
				break ;

			case 'get' :
				client.response.stats.internalStartTime = Date.now() ;
				responseContext = await this.app.get( message.path , params ) ;
				client.response.stats.internalEndTime = Date.now() ;
				client.response.statusCode = 200 ;
				this.writeData( client.response , responseContext ) ;
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
					this.writeData( client.response , responseContext ) ;
				}
				else {
					this.endHandler( client.response ) ;
				}

				break ;

			case 'put' :
				if ( ! message.data ) { return this.errorHandler( client.response , ErrorStatus.badRequest( 'PUT without body' ) ) ; }

				client.response.stats.internalStartTime = Date.now() ;
				responseContext = await this.app.put( message.path , message.data , message.attachmentStreams , params ) ;
				client.response.stats.internalEndTime = Date.now() ;
				client.response.statusCode = responseContext.output.httpStatus || 204 ;
				//this.writeData( client.response , responseContext ) ;
				this.endHandler( client.response ) ;
				break ;

			case 'patch' :
				if ( ! message.data ) { return this.errorHandler( client.response , ErrorStatus.badRequest( 'PATCH without body...' ) ) ; }

				client.response.stats.internalStartTime = Date.now() ;
				responseContext = await this.app.patch( message.path , message.data , message.attachmentStreams , params ) ;
				client.response.stats.internalEndTime = Date.now() ;

				client.response.statusCode = responseContext.output.httpStatus ||
					( responseContext.output.data ? 200 : 204 ) ;

				if ( responseContext.output.data ) {
					this.writeData( client.response , responseContext ) ;
				}
				else {
					this.endHandler( client.response ) ;
				}

				break ;

			case 'delete' :
				client.response.stats.internalStartTime = Date.now() ;
				responseContext = await this.app.delete( message.path , params ) ;
				client.response.stats.internalEndTime = Date.now() ;
				client.response.statusCode = 204 ;
				//this.writeData( client.response , responseContext ) ;
				this.endHandler( client.response ) ;
				break ;

			default :
				throw ErrorStatus.methodNotAllowed( "Method not allowed: " + message.method ) ;
		}
	}
	catch ( error ) {
		this.errorHandler( client.response , error ) ;
	}
} ;



HttpModule.prototype.writeData = function( httpResponse , responseContext ) {
	var encodedFilename ;

	if ( ! responseContext.output.data ) {
		if ( httpResponse.statusCode === 200 ) {
			httpResponse.statusCode = 204 ;
		}

		this.endHandler( httpResponse ) ;
		return ;
	}

	// First fix some header things
	httpResponse.setHeader( 'content-type' , 'application/json' ) ;

	if ( httpResponse.chunkedEncoding ) {
		httpResponse.setHeader( 'trailer' , [
			'x-request-time' ,
			'x-internal-time'
		] ) ;
	}

	if ( responseContext.output.data instanceof stream.Readable ) {
		// This is a file stream...
		if ( responseContext.output.meta ) {
			if ( responseContext.output.meta.contentType ) {
				httpResponse.setHeader( 'content-type' , responseContext.output.meta.contentType ) ;
			}

			if ( responseContext.output.meta.filename ) {
				encodedFilename = encodeURIComponent( responseContext.output.meta.filename ) ;
				httpResponse.setHeader( 'content-disposition' , 'inline; filename="' + encodedFilename + "\"; filename*=UTF-8''" + encodedFilename ) ;
			}

			if ( responseContext.output.meta.hashType && responseContext.output.meta.hash ) {
				httpResponse.setHeader( 'digest' , HttpModule.stringifyDigest( responseContext.output.meta.hashType , responseContext.output.meta.hash ) ) ;
			}
		}

		responseContext.output.data.on( 'error' , streamError => {
			this.errorHandler( httpResponse , streamError ) ;
		} ) ;

		responseContext.output.data.pipe( httpResponse ) ;	// Simply pipe the file stream to the http response stream
		return ;
	}

	httpResponse.write( restQuery.misc.serializeContextData( responseContext ) ) ;

	this.endHandler( httpResponse ) ;
} ;



HttpModule.prototype.errorHandler = function( httpResponse , error ) {
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
	this.endHandler( httpResponse ) ;
} ;



HttpModule.prototype.endHandler = function( httpResponse ) {
	var moreHeaders ;

	if ( httpResponse.stats ) {
		moreHeaders = {} ;

		if ( httpResponse.stats.internalEndTime && httpResponse.stats.internalStartTime ) {
			moreHeaders['x-internal-time'] = ( httpResponse.stats.internalEndTime - httpResponse.stats.internalStartTime ) + 'ms' ;
		}

		moreHeaders['x-request-time'] = ( Date.now() - httpResponse.stats.startTime ) + 'ms' ;

		if ( httpResponse.headersSent ) {
			if ( httpResponse.chunkedEncoding ) {
				httpResponse.addTrailers( moreHeaders ) ;
			}
		}
		else {
			httpResponse.writeHead( httpResponse.statusCode , moreHeaders ) ;
		}
	}

	httpResponse.end() ;
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



HttpModule.prototype.parseMultipartBody = function( multipart , message ) {
	var sent , terminated , waitCount = 0 , readyToSend = false , lastError ,
		remainingMaxSize = this.maxBodyDataSize ,
		promise = new Promise() ;

	message.data = {} ;

	var sendBack = error => {
		if ( sent ) { return ; }

		if ( waitCount > 0 ) {
			readyToSend = true ;
			lastError = error ;
			return ;
		}

		sent = true ;

		if ( error ) { promise.reject( error ) ; }
		else { promise.resolve( message ) ; }
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

		part.on( 'header' , ( headers_ ) => {

			var contentDisposition , contentType ;

			headers = headers_ ;
			contentType = this.parseComplexHeader( headers['content-type'] ) ;
			contentDisposition = this.parseComplexHeader( headers['content-disposition'] ) ;

			if ( ! contentDisposition || ! contentDisposition.name ) {
				// /!\ For instance, we are only processing multipart/form-data, so we will drop that part /!\
				part.resume() ;
			}
			//else if ( headers['content-type'] === 'application/octet-stream' )	// not reliable
			//else if ( 'filename' in contentDisposition )	// Browser BLOB has filename even if we don't want...
			else if ( contentDisposition.filename ) {
				// ... so empty filename are processed like regular non-file data
				// This is a file!
				this.populateMessageAttachment( message , contentType , contentDisposition , headers , part ) ;

				// Send back now, files are streamed
				sendBack() ;
			}
			else if ( sent ) {
				// Meta data should be send before any file, any trailing meta data are dropped
				part.resume() ;
			}
			else {
				wait() ;

				this.getAllStreamContent( part , remainingMaxSize ).then(
					content => {
						switch ( contentType ? SUPPORTED_DATA_CONTENT_TYPE[ contentType.__primary ] : 'text' ) {
							case 'json' :
								try {
									content = JSON.parse( content ) ;
								}
								catch ( error_ ) {
									// Bad JSON, drop it!
									//log.error( "Part's content is not a valid JSON: %E" , error_ ) ;
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
								terminate( ErrorStatus.badRequest( 'Unsupported content-type header for data: ' + contentType?.__primary ) ) ;
								return ;
						}

						// + 4 double-quote, 1 colon, 1 comma
						remainingMaxSize -= content.length + contentDisposition.name.length + 6 ;
						//message.data[ contentDisposition.name ] = content ;
						tree.path.set( message.data , contentDisposition.name , content ) ;

						done() ;
					} ,
					error => { terminate( error ) ; }
				) ;
			}
		} ) ;

		// Debug
		//part.on( 'data' , ( data ) { log.debug( 'Part data: %s' , data ) ; } ) ;
		//part.once( 'end' , () => { log.debug( 'Part: End of part' ) ; } ) ;
	} ) ;

	multipart.once( 'finish' , () => {
		// No new attachment stream will be added
		if ( message.attachmentStreams ) { message.attachmentStreams.end() ; }

		sendBack() ;
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



// For instance, I don't know how special character are supposed to be escaped, if supported...
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

