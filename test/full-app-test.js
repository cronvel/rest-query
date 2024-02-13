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

/* global describe, it, before, after, expect */

"use strict" ;



var cliOptions = getCliOptions() ;

const restQuery = require( '..' ) ;

const Logfella = require( 'logfella' ) ;

if ( cliOptions.overrideConsole === undefined ) { cliOptions.overrideConsole = false ; }
if ( ! cliOptions.log ) { cliOptions.log = { minLevel: 4 } ; }
//if ( ! cliOptions.log ) { cliOptions.log = { minLevel: 1 } ; }
const log = Logfella.global.use( 'unit-test' ) ;

const http = require( 'http' ) ;
const url = require( 'url' ) ;
const childProcess = require( 'child_process' ) ;

const mongodb = require( 'mongodb' ) ;

const crypto = require( 'crypto' ) ;
const stream = require( 'stream' ) ;
const streamKit = require( 'stream-kit' ) ;
const FormData = require( 'form-data' ) ;

const Promise = require( 'seventh' ) ;
const tree = require( 'tree-kit' ) ;
//const fsKit = require( 'fs-kit' ) ;

var appProto = 'http' ;
var appPort = 1234 ;
var appProcess ;
var dbUrl = 'mongodb://localhost:27017/restQuery' ;
var db ;
var PUBLIC_URL = 'cdn.example.com/app' ;	// From the config sample/main.kfg





/* Utils */



// it flatten prototype chain, so a single object owns every property of its parents
const protoflatten = tree.extend.bind( undefined , { deep: true , immutables: [ mongodb.ObjectId.prototype ] } , null ) ;



// Return options while trying to avoid mocha's parameters
function getCliOptions() {
	var i , max = 0 ;

	for ( i = 2 ; i < process.argv.length ; i ++ ) {
		if ( process.argv[ i ].match( /\*|.+\.js/ ) ) {
			max = i ;
		}
	}

	return require( 'minimist' )( process.argv.slice( max + 1 ) ) ;
}



function debug() {
	if ( cliOptions.log ) { console.log( ... arguments ) ; }
}



// clear DB: remove every item, so we can safely test
function clearDB() {
	return Promise.all( [
		//clearCollection( 'root' ) ,	// Don't clear this collection here, this causes troubles with the cache
		clearCollection( 'blogs' ) ,
		clearCollection( 'posts' ) ,
		clearCollection( 'comments' ) ,
		clearCollection( 'users' ) ,
		clearCollection( 'images' )
	] ) ;
}



async function clearCollection( collectionName ) {
	var collection = db.collection( collectionName ) ;
	await collection.deleteMany() ;
	
	// ??? this is a mongo collection node not a restquery collection
	//if ( collection.attachmentUrl ) { await fsKit.deltree( collection.attachmentUrl ) ; } 
}



function connect() {
	return mongodb.MongoClient.connect( dbUrl , { useNewUrlParser: true , useUnifiedTopology: true } ).then( client => {
		db = client.db() ;
	} ) ;
}



function runApp() {
	var promise = new Promise() ;
	
	appProcess = childProcess.fork( __dirname + '/../bin/rest-query' ,
		[
			'server' ,
			'--config' , __dirname + '/../sample/main.kfg' ,
			'--port' , appPort ,
			//'--log.minLevel' , 'debug' ,
			'--buildIndexes'
		] ,
		{ stdio: 'pipe' }
	) ;

	// Exists with .spawn() but not with .fork() unless stdio: 'pipe' is used
	appProcess.stdout.on( 'data' , data => {
		//log.debug( "[appProcess STDOUT] %s" , data.toString() ) ;
	} ) ;

	appProcess.stderr.on( 'data' , data => {
		//log.error( "[appProcess STDERR] %s" , data.toString() ) ;
	} ) ;

	// We wait for the child to send a ready event, indicating that the child is ready to receive HTTP requests
	appProcess.on( 'message' , data => {
		console.log( "[child message received] " , data ) ;
		if ( data.event === 'ready' ) { promise.resolve() ; }
	} ) ;

	appProcess.on( 'error' , error => {
		console.error( "[child error] " , error ) ;
		promise.reject( error ) ;
	} ) ;

	appProcess.on( 'exit' , ( code ) => {
		console.log( '[appProcess exit] ' + code ) ;
	} ) ;
	
	return promise ;
}



function killApp() {
	appProcess.kill( 'SIGKILL' ) ;

	// Expect the app to be killed within 100ms
	//setTimeout( maybeCallback , 100 ) ;
	return Promise.resolveTimeout( 100 ) ;
}



function requester( query_ ) {
	var promise = new Promise() ;

	var query = tree.extend( null , { hostname: 'localhost' , port: appPort } , query_ ) ;

	var parsed = url.parse( query.path ) ;
	//log.hdebug( "parsed: %J" , parsed ) ;
	// Search string is more complicated to escape...

	query.path =
		encodeURI( parsed.pathname )
		+ ( parsed.search ?
			'?' + parsed.search.slice( 1 ).replace( /[^&=,[\]+]+/g , match => encodeURIComponent( match ) ) :
			''
		) ;

	//log.hdebug( "path before: %s -- after: %s" , query_.path , query.path ) ;

	var request =
		query.multipartFormData ? multipartRequest( query ) :
		query.body instanceof stream.Readable ? streamRequest( query ) :
		normalRequest( query ) ;

	request.on( 'response' , response => {
		var body = '' ;

		//console.log( '[requester] STATUS: ' + response.statusCode ) ;
		//console.log( '[requester] HEADERS: ' + JSON.stringify( response.headers ) ) ;
		response.setEncoding( 'utf8' ) ;

		response.on( 'data' , ( chunk ) => {
			body += chunk.toString() ;
			//console.log( '[requester] BODY: ' + chunk ) ;
		} ) ;

		response.on( 'end' , () => {
			//console.log( 'END' ) ;
			promise.resolve( {
				httpVersion: response.httpVersion ,
				status: response.statusCode ,
				headers: response.headers ,
				body: body
			} ) ;
		} ) ;
	} ) ;

	request.on( 'error' , ( error ) => {
		//console.log( '[requester] problem with request: ' + error.message ) ;
		promise.reject( error ) ;
	} ) ;

	return promise ;
}



function normalRequest( query ) {
	if ( query.body ) {
		if ( typeof query.body !== 'string' ) { query.body = JSON.stringify( query.body ) ; }
		query.headers['content-length'] = Buffer.byteLength( query.body ) ;
	}

	var request = http.request( query ) ;

	// Write the request's body
	if ( query.body ) { request.write( query.body ) ; }

	request.end() ;

	return request ;
}



function streamRequest( query ) {
	query.headers['content-type'] = query.body?.meta?.contentType ?? 'application/octet-stream' ;
	query.headers['content-disposition'] = 'inline; filename="' + query.body?.meta?.filename + '"' ;
	
	var request = http.request( query ) ;

	// Write the request's body
	query.body.pipe( request ) ;

	return request ;
}



function multipartRequest( query ) {
	var form = new FormData() ;

	for ( let fieldName in query.multipartFormData ) {
		let value = query.multipartFormData[ fieldName ] ,
			header = {} ,
			filename ;

		if ( value instanceof stream.Readable ) {
			filename = value?.meta?.filename ?? 'file' ;
			if ( value?.meta?.contentType ) { header['content-type'] = value.meta.contentType ; }
			if ( value?.meta?.hashType && value?.meta?.hash ) { header['digest'] = restQuery.HttpModule.stringifyDigest( value.meta.hashType , value.meta.hash ) ; }
		}
		else if ( typeof value !== 'string' ) {
			value = JSON.stringify( value ) ;
			header['content-type'] = 'application/json' ;
		}

		form.append( fieldName , value , { header , filename } ) ;
	}

	if ( query.headers ) {
		Object.assign( query.headers , form.getHeaders() ) ;
	}
	else {
		query.headers = form.getHeaders() ;
	}

	var request = http.request( query ) ;

	form.pipe( request ) ;
	
	//request.end() ;
	//form.on( 'finish' , () => request.end() ) ;

	return request ;
}





/* Tests */



describe( "Service" , () => {

	// Should not be top-level, or they will be launched concurrently with other unit-test files

	before( async () => {
		//log.hdebug( "Executing before" ) ;
		//await Promise.resolveTimeout( 1000 ) ;
		await Promise.all( [ connect() , runApp() ] ) ;
		//log.hdebug( "Executing before done" ) ;
	} ) ;

	after( () => {
		return killApp() ;
	} ) ;

	beforeEach( clearDB ) ;



	describe( "Basics tests" , () => {

		it( "GET on an unexistant blog" , async () => {
			var getQuery = {
				method: 'GET' ,
				path: '/Blogs/111111111111111111111111' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			var response = await requester( getQuery ) ;
			expect( response.status ).to.be( 404 ) ;
			expect( response.body ).not.to.be.ok() ;
		} ) ;

		it( "PUT then GET on a blog" , async () => {
			var response , data ;
			
			var putQuery = {
				method: 'PUT' ,
				path: '/Blogs/543bb877bd15489d0d7b0120' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					title: "My website!" ,
					description: "... about my wonderful life" ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			var getQuery = {
				method: 'GET' ,
				path: '/Blogs/543bb877bd15489d0d7b0120' ,
				headers: {
					Host: 'localhost'
				}
			} ;
			
			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			
			data = JSON.parse( response.body ) ;
			
			expect( data ).to.equal( {
				_id: "543bb877bd15489d0d7b0120" ,
				title: "My website!" ,
				description: "... about my wonderful life" ,
				slugId: data.slugId ,	// Cannot be predicted
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;
			
			getQuery.path += "?access=all" ;
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			
			data = JSON.parse( response.body ) ;
			
			expect( data ).to.equal( {
				_id: "543bb877bd15489d0d7b0120" ,
				title: "My website!" ,
				description: "... about my wonderful life" ,
				slugId: data.slugId ,	// Cannot be predicted
				parent: {
					collection: 'root' ,
					id: '/'
				} ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: { traverse: true , read: true , create: true }
			} ) ;
		} ) ;

		it( "POST then GET on a blog" , async () => {
			var response , data , postDocument ;

			var postQuery = {
				method: 'POST' ,
				path: '/Blogs' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					title: "My website!" ,
					description: "... about my wonderful life" ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			var getQuery = {
				method: 'GET' ,
				path: '/Blogs/' ,	// this should be completed with the ID after the POST
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( postQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;
			postDocument = JSON.parse( response.body ) ;
			expect( typeof postDocument.id ).to.be( 'string' ) ;
			expect( postDocument.id.length ).to.be( 24 ) ;
			//console.log( response.headers.location ) ;
			expect( response.headers.location ).to.be( appProto + '://localhost:' + appPort + '/Blogs/' + postDocument.id ) ;
			
			getQuery.path += postDocument.id ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: postDocument.id ,
				title: "My website!" ,
				description: "... about my wonderful life" ,
				slugId: data.slugId ,	// Cannot be predicted
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;
			
			getQuery.path += "?access=all" ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: postDocument.id ,
				title: "My website!" ,
				description: "... about my wonderful life" ,
				slugId: data.slugId ,	// Cannot be predicted
				parent: {
					collection: 'root' ,
					id: '/'
				} ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: { traverse: true , read: true , create: true }
			} ) ;
			//console.log( "Response:" , response ) ;
		} ) ;

		it( "PUT, PATCH then GET on a blog" , async () => {
			var response , data ;
			
			var putQuery = {
				method: 'PUT' ,
				path: '/Blogs/543bb877bd15489d0d7b0121' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					title: "My website!" ,
					description: "... about my wonderful life" ,
						publicAccess: {
						traverse: true , read: true , write: true , delete: true , create: true
					}
				}
			} ;

			var patchQuery = {
				method: 'PATCH' ,
				path: '/Blogs/543bb877bd15489d0d7b0121' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					title: "My *NEW* website!" ,
					description: "... about my wonderful life"
				}
			} ;

			var getQuery = {
				method: 'GET' ,
				path: '/Blogs/543bb877bd15489d0d7b0121' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			
			response = await requester( patchQuery ) ;
			expect( response.status ).to.be( 204 ) ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb877bd15489d0d7b0121" ,
				title: "My *NEW* website!" ,
				description: "... about my wonderful life" ,
				slugId: data.slugId ,	// Cannot be predicted
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;
			//console.log( "Response:" , response ) ;

			getQuery.path += "?access=all" ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb877bd15489d0d7b0121" ,
				title: "My *NEW* website!" ,
				description: "... about my wonderful life" ,
				slugId: data.slugId ,	// Cannot be predicted
				parent: {
					collection: 'root' ,
					id: '/'
				} ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , create: true
				}
			} ) ;
			//console.log( "Response:" , response ) ;
		} ) ;

		it( "PUT, DELETE then GET on a blog" , async () => {
			var response , data ;

			var putQuery = {
				method: 'PUT' ,
				path: '/Blogs/543bb877bd15489d0d7b0122' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					title: "My website!" ,
					description: "... about my wonderful life" ,
					publicAccess: {
						traverse: true , read: true , write: true , delete: true , create: true
					}
				}
			} ;

			var deleteQuery = {
				method: 'DELETE' ,
				path: '/Blogs/543bb877bd15489d0d7b0122' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				}
			} ;

			var getQuery = {
				method: 'GET' ,
				path: '/Blogs/543bb877bd15489d0d7b0122' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;

			response = await requester( deleteQuery ) ;
			expect( response.status ).to.be( 204 ) ;
			//console.log( "Response:" , response ) ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 404 ) ;
			expect( response.body ).not.to.be.ok() ;
			//console.log( "Response:" , response ) ;
		} ) ;

		it( "Multiple PUT then GET on the whole blog collection" , async () => {
			var response , data ;
			
			var putQuery1 = {
				method: 'PUT' ,
				path: '/Blogs/543bb877bd15489d0d7b0121' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					title: "First post!" ,
					description: "Everything started with that."
				}
			} ;

			var putQuery2 = {
				method: 'PUT' ,
				path: '/Blogs/543bb877bd15489d0d7b0122' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					title: "About" ,
					description: "About this blog."
				}
			} ;

			var putQuery3 = {
				method: 'PUT' ,
				path: '/Blogs/543bb877bd15489d0d7b0123' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					title: "10 things about nothing" ,
					description: "10 things you should know... or not..."
				}
			} ;

			var getQuery = {
				method: 'GET' ,
				path: '/Blogs/' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( putQuery1 ) ;
			expect( response.status ).to.be( 201 ) ;
			
			response = await requester( putQuery2 ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;

			response = await requester( putQuery3 ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			data = data.sort( ( a , b ) => a._id < b._id ? -1 : 1 ) ;
			expect( data ).to.equal( [
				{
					_id: "543bb877bd15489d0d7b0121" ,
					title: "First post!" ,
					description: "Everything started with that." ,
					slugId: data[ 0 ].slugId ,	// Cannot be predicted
					parent: {
						collection: 'root' ,
						id: '/'
					}
				} ,
				{
					_id: "543bb877bd15489d0d7b0122" ,
					title: "About" ,
					description: "About this blog." ,
					slugId: data[ 1 ].slugId ,	// Cannot be predicted
					parent: {
						collection: 'root' ,
						id: '/'
					}
				} ,
				{
					_id: "543bb877bd15489d0d7b0123" ,
					title: "10 things about nothing" ,
					description: "10 things you should know... or not..." ,
					slugId: data[ 2 ].slugId ,	// Cannot be predicted
					parent: {
						collection: 'root' ,
						id: '/'
					}
				}
			] ) ;
			//console.log( "Response:" , response ) ;
		} ) ;
	} ) ;



	describe( "Test slugs" , () => {

		it( "GET on a blog using the slug" , async () => {
			var response , data ;
			
			var putQuery = {
				method: 'PUT' ,
				path: '/Blogs/543bb877bd15489d0d7b0aaa' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					title: "My wonderful website!" ,
					description: "... about my wonderful life" ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			var getQuery = {
				method: 'GET' ,
				path: '/Blogs/my-wonderful-website' ,
				headers: {
					Host: 'localhost'
				}
			} ;
			
			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			
			data = JSON.parse( response.body ) ;
			
			expect( data ).to.equal( {
				_id: "543bb877bd15489d0d7b0aaa" ,
				title: "My wonderful website!" ,
				description: "... about my wonderful life" ,
				slugId: 'my-wonderful-website' ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;
		} ) ;

		it( "GET on a blog using an unicode slug" , async () => {
			var response , data ;
			
			var putQuery = {
				method: 'PUT' ,
				path: '/Blogs/543bb877bd15489d0d7b0bbb' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					title: 'عِنْدَمَا ذَهَبْتُ إِلَى ٱلْمَكْتَبَةِ' ,
					description: 'كنت أريد أن أقرأ كتابا عن تاريخ المرأة في فرنسا' ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			var getQuery = {
				method: 'GET' ,
				path: '/Blogs/عِنْدَمَا-ذَهَبْتُ-إِلَى-ٱلْمَكْتَبَةِ' ,
				headers: {
					Host: 'localhost'
				}
			} ;
			
			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			
			data = JSON.parse( response.body ) ;
			
			expect( data ).to.equal( {
				_id: "543bb877bd15489d0d7b0bbb" ,
				title: 'عِنْدَمَا ذَهَبْتُ إِلَى ٱلْمَكْتَبَةِ' ,
				description: 'كنت أريد أن أقرأ كتابا عن تاريخ المرأة في فرنسا' ,
				slugId: 'عِنْدَمَا-ذَهَبْتُ-إِلَى-ٱلْمَكْتَبَةِ' ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;
		} ) ;
	} ) ;



	describe( "Basics tests on users" , () => {

		it( "GET on an unexistant user" , async () => {
			var getQuery = {
				method: 'GET' ,
				path: '/Users/111111111111111111111111' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			var response = await requester( getQuery ) ;
			expect( response.status ).to.be( 404 ) ;
			expect( response.body ).not.to.be.ok() ;
			//console.log( "Response:" , response ) ;
		} ) ;

		it( "PUT then GET on a user" , async () => {
			var response , data ;
			
			var putQuery = {
				method: 'PUT' ,
				path: '/Users/543bb877bd15489d0d7b0130' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					firstName: "Joe" ,
					lastName: "Doe2" ,
					email: "joe.doe2@gmail.com" ,
					password: "pw" ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			var getQuery = {
				method: 'GET' ,
				path: '/Users/543bb877bd15489d0d7b0130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb877bd15489d0d7b0130" ,
				firstName: "Joe" ,
				lastName: "Doe2" ,
				email: "joe.doe2@gmail.com" ,
				login: "joe.doe2@gmail.com" ,
				friends: [] ,
				//groups: {} ,
				slugId: data.slugId ,	// Cannot be predicted
				hid: "Joe Doe2" ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;
			
			getQuery.path += "?access=all" ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			
			expect( data ).to.equal( {
				_id: "543bb877bd15489d0d7b0130" ,
				firstName: "Joe" ,
				lastName: "Doe2" ,
				email: "joe.doe2@gmail.com" ,
				login: "joe.doe2@gmail.com" ,
				friends: [] ,
				groups: {} ,
				slugId: data.slugId ,	// Cannot be predicted
				hid: "Joe Doe2" ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: { traverse: true , read: true , create: true } ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;
			//console.log( "Response:" , response ) ;
		} ) ;

		it( "PUT, DELETE then GET on a user" , async () => {
			var response , data ;
			
			var putQuery = {
				method: 'PUT' ,
				path: '/Users/543bb877bd15489d0d7b0132' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					firstName: "John" ,
					lastName: "Doe" ,
					email: "john.doe@gmail.com" ,
					password: "pw" ,
					publicAccess: {
						traverse: true , read: true , write: true , delete: true , create: true
					}
				}
			} ;

			var deleteQuery = {
				method: 'DELETE' ,
				path: '/Users/543bb877bd15489d0d7b0132' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				}
			} ;

			var getQuery = {
				method: 'GET' ,
				path: '/Users/543bb877bd15489d0d7b0132' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;

			response = await requester( deleteQuery ) ;
			expect( response.status ).to.be( 204 ) ;
			//console.log( "Response:" , response ) ;
		} ) ;
	} ) ;



	describe( "Attachment" , () => {

		it( "PUT a document with an attachment (multipart/form-data) then GET it" , async function() {
			this.timeout( 4000 ) ;

			var response , data ,
				contentHash = crypto.createHash( 'sha256' ).update( 'a'.repeat( 40 ) ).digest( 'base64' ) ;

			var putQuery = {
				method: 'PUT' ,
				path: '/Users/543bb877bd15c89dad7b0130' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				multipartFormData: {
					firstName: "Joe" ,
					lastName: "Doe2" ,
					email: "joe.doe2@gmail.com" ,
					password: "pw" ,
					publicAccess: { traverse: true , read: true , create: true } ,
					avatar: new streamKit.FakeReadable( {
						timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'a'.charCodeAt( 0 ) , meta: { filename: 'test.txt' }
					} )
				}
			} ;

			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;

			var getQuery = {
				method: 'GET' ,
				path: '/Users/543bb877bd15c89dad7b0130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb877bd15c89dad7b0130" ,
				firstName: "Joe" ,
				lastName: "Doe2" ,
				email: "joe.doe2@gmail.com" ,
				login: "joe.doe2@gmail.com" ,
				friends: [] ,
				//groups: {} ,
				slugId: data.slugId ,	// Cannot be predicted
				hid: "Joe Doe2" ,
				avatar: {
					contentType: 'text/plain' ,
					filename: 'test.txt' ,
					extension: 'txt' ,
					hashType: 'sha256' ,
					hash: contentHash ,
					fileSize: 40 ,
					metadata: {} ,
					publicUrl: PUBLIC_URL + '/users/543bb877bd15c89dad7b0130/' + data.avatar.id ,
					id: data.avatar.id	// Cannot be predicted
				} ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;

			var getAttachmentQuery = {
				method: 'GET' ,
				path: '/Users/543bb877bd15c89dad7b0130/~avatar' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'a'.repeat( 40 ) ) ;

			// Should retrieve the correct hash
			expect( response.headers.digest ).to.be( 'sha-256=' + contentHash ) ;
		} ) ;

		it( "PUT an attachment on an existing document then GET it" , async function() {
			this.timeout( 4000 ) ;

			var response , data ,
				contentHash = crypto.createHash( 'sha256' ).update( 'b'.repeat( 40 ) ).digest( 'base64' ) ;
			
			var putQuery = {
				method: 'PUT' ,
				path: '/Users/543bb8d7bd15a89dad7b0130' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					firstName: "Joe" ,
					lastName: "Doe2" ,
					email: "joe.doe2@gmail.com" ,
					password: "pw" ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;

			var putAttachmentQuery = {
				method: 'PUT' ,
				path: '/Users/543bb8d7bd15a89dad7b0130/~avatar' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream'
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'b'.charCodeAt( 0 ) , meta: { filename: 'test2.txt' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putAttachmentQuery ) ;
			expect( response.status ).to.be( 204 ) ;
			//console.log( "Response:" , response ) ;

			var getQuery = {
				method: 'GET' ,
				path: '/Users/543bb8d7bd15a89dad7b0130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb8d7bd15a89dad7b0130" ,
				firstName: "Joe" ,
				lastName: "Doe2" ,
				email: "joe.doe2@gmail.com" ,
				login: "joe.doe2@gmail.com" ,
				friends: [] ,
				//groups: {} ,
				slugId: data.slugId ,	// Cannot be predicted
				hid: "Joe Doe2" ,
				avatar: {
					contentType: 'text/plain' ,
					filename: 'test2.txt' ,
					extension: 'txt' ,
					hashType: 'sha256' ,
					hash: contentHash ,
					fileSize: 40 ,
					metadata: {} ,
					publicUrl: PUBLIC_URL + '/users/543bb8d7bd15a89dad7b0130/' + data.avatar.id ,
					id: data.avatar.id	// Cannot be predicted
				} ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;

			var getAttachmentQuery = {
				method: 'GET' ,
				path: '/Users/543bb8d7bd15a89dad7b0130/~avatar' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'b'.repeat( 40 ) ) ;

			// Should retrieve the correct hash
			expect( response.headers.digest ).to.be( 'sha-256=' + contentHash ) ;
		} ) ;

		it( "PUT a document with an attachment (multipart/form-data) with checksum/hash part header" , async function() {
			this.timeout( 4000 ) ;

			var response , data ,
				contentHash = crypto.createHash( 'sha256' ).update( 'a'.repeat( 40 ) ).digest( 'base64' ) ,
				badContentHash = contentHash.slice( 0 , -3 ) + 'bad' ;


			// First, with a bad hash

			var putBadQuery = {
				method: 'PUT' ,
				path: '/Users/543bb877bd15c89dad7b0130' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				multipartFormData: {
					firstName: "Joe" ,
					lastName: "Doe2" ,
					email: "joe.doe2@gmail.com" ,
					password: "pw" ,
					publicAccess: { traverse: true , read: true , create: true } ,
					avatar: new streamKit.FakeReadable( {
						timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'a'.charCodeAt( 0 ) , meta: { filename: 'test.txt' , hashType: 'sha256' , hash: badContentHash }
					} )
				}
			} ;

			response = await requester( putBadQuery ) ;
			expect( response.status ).to.be( 400 ) ;


			// Then, with the correct hash

			var putQuery = {
				method: 'PUT' ,
				path: '/Users/543bb877bd15c89dad7b0130' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				multipartFormData: {
					firstName: "Joe" ,
					lastName: "Doe2" ,
					email: "joe.doe2@gmail.com" ,
					password: "pw" ,
					publicAccess: { traverse: true , read: true , create: true } ,
					avatar: new streamKit.FakeReadable( {
						timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'a'.charCodeAt( 0 ) , meta: { filename: 'test.txt' , hashType: 'sha256' , hash: contentHash }
					} )
				}
			} ;

			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;

			var getQuery = {
				method: 'GET' ,
				path: '/Users/543bb877bd15c89dad7b0130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb877bd15c89dad7b0130" ,
				firstName: "Joe" ,
				lastName: "Doe2" ,
				email: "joe.doe2@gmail.com" ,
				login: "joe.doe2@gmail.com" ,
				friends: [] ,
				//groups: {} ,
				slugId: data.slugId ,	// Cannot be predicted
				hid: "Joe Doe2" ,
				avatar: {
					contentType: 'text/plain' ,
					filename: 'test.txt' ,
					extension: 'txt' ,
					hashType: 'sha256' ,
					hash: contentHash ,
					fileSize: 40 ,
					metadata: {} ,
					publicUrl: PUBLIC_URL + '/users/543bb877bd15c89dad7b0130/' + data.avatar.id ,
					id: data.avatar.id	// Cannot be predicted
				} ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;

			var getAttachmentQuery = {
				method: 'GET' ,
				path: '/Users/543bb877bd15c89dad7b0130/~avatar' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'a'.repeat( 40 ) ) ;

			// Should retrieve the correct hash
			expect( response.headers.digest ).to.be( 'sha-256=' + contentHash ) ;
		} ) ;

		it( "PUT an attachment with checksum/hash header" , async function() {
			this.timeout( 4000 ) ;

			var response , data ,
				contentHash = crypto.createHash( 'sha256' ).update( 'b'.repeat( 40 ) ).digest( 'base64' ) ,
				badContentHash = contentHash.slice( 0 , -3 ) + 'bad' ;

			var putQuery = {
				method: 'PUT' ,
				path: '/Users/543bb8d7bd15a89dad7b0130' ,
				headers: {
					Host: "localhost" ,
					"content-type": "application/json"
				} ,
				body: {
					firstName: "Joe" ,
					lastName: "Doe2" ,
					email: "joe.doe2@gmail.com" ,
					password: "pw" ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;


			// First, with a bad checksum

			var putBadAttachmentQuery = {
				method: 'PUT' ,
				path: '/Users/543bb8d7bd15a89dad7b0130/~avatar' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream' ,
					"digest": "sha-256=" + badContentHash
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'b'.charCodeAt( 0 ) , meta: { filename: 'test2.txt' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putBadAttachmentQuery ) ;
			//console.error( response ) ;
			expect( response.status ).to.be( 400 ) ;


			// Then, with the correct checksum

			var putAttachmentQuery = {
				method: 'PUT' ,
				path: '/Users/543bb8d7bd15a89dad7b0130/~avatar' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream' ,
					"digest": "sha-256=" + contentHash
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'b'.charCodeAt( 0 ) , meta: { filename: 'test2.txt' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putAttachmentQuery ) ;
			//console.error( response ) ;
			expect( response.status ).to.be( 204 ) ;



			//console.log( "Response:" , response ) ;

			var getQuery = {
				method: 'GET' ,
				path: '/Users/543bb8d7bd15a89dad7b0130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb8d7bd15a89dad7b0130" ,
				firstName: "Joe" ,
				lastName: "Doe2" ,
				email: "joe.doe2@gmail.com" ,
				login: "joe.doe2@gmail.com" ,
				friends: [] ,
				//groups: {} ,
				slugId: data.slugId ,	// Cannot be predicted
				hid: "Joe Doe2" ,
				avatar: {
					contentType: 'text/plain' ,
					filename: 'test2.txt' ,
					extension: 'txt' ,
					hashType: 'sha256' ,
					hash: contentHash ,
					fileSize: 40 ,
					metadata: {} ,
					publicUrl: PUBLIC_URL + '/users/543bb8d7bd15a89dad7b0130/' + data.avatar.id ,
					id: data.avatar.id	// Cannot be predicted
				} ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;

			var getAttachmentQuery = {
				method: 'GET' ,
				path: '/Users/543bb8d7bd15a89dad7b0130/~avatar' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'b'.repeat( 40 ) ) ;
		} ) ;
	} ) ;



	describe( "AttachmentSet" , () => {

		it( "PUT an attachment on an AttachmentSet of an existing document then GET it" , async function() {
			this.timeout( 4000 ) ;

			var response , data ,
				contentHash = crypto.createHash( 'sha256' ).update( 'z'.repeat( 40 ) ).digest( 'base64' ) ;
			
			var putQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					name: "image" ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;

			var putAttachmentQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~file' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream'
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'z'.charCodeAt( 0 ) , meta: { filename: 'image.png' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putAttachmentQuery ) ;
			expect( response.status ).to.be( 204 ) ;
			//console.log( "Response:" , response ) ;

			var getQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb8d7bd15a89dad7ba130" ,
				name: "image" ,
				slugId: data.slugId ,	// Cannot be predicted
				file: {
					attachments: {
						source: {
							contentType: "text/plain" ,
							filename: "image.png" ,
							extension: 'png' ,
							hashType: "sha256" ,
							hash: contentHash ,
							fileSize: 40 ,
							metadata: {} ,
							publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.file.attachments.source.id ,
							id: data.file.attachments.source.id	// Cannot be predicted
						}
					} ,
					metadata: {}
				} ,
				arrayOfAttachments: [] ,
				arrayOfAttachmentSets: [] ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;

			var getAttachmentQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~file' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'z'.repeat( 40 ) ) ;

			// Should retrieve the correct hash
			expect( response.headers.digest ).to.be( 'sha-256=' + contentHash ) ;


			// GET it using the variant name
			
			getAttachmentQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~file/~source' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'z'.repeat( 40 ) ) ;

			// Should retrieve the correct hash
			expect( response.headers.digest ).to.be( 'sha-256=' + contentHash ) ;


			// PUT on a variant
			
			var contentHashThumbnail = crypto.createHash( 'sha256' ).update( 'x'.repeat( 40 ) ).digest( 'base64' ) ;

			putAttachmentQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~file/~thumbnail' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream'
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'x'.charCodeAt( 0 ) , meta: { filename: 'thumbnail.png' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putAttachmentQuery ) ;
			expect( response.status ).to.be( 204 ) ;


			getQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb8d7bd15a89dad7ba130" ,
				name: "image" ,
				slugId: data.slugId ,	// Cannot be predicted
				file: {
					attachments: {
						source: {
							contentType: "text/plain" ,
							filename: "image.png" ,
							extension: 'png' ,
							hashType: "sha256" ,
							hash: contentHash ,
							fileSize: 40 ,
							metadata: {} ,
							publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.file.attachments.source.id ,
							id: data.file.attachments.source.id	// Cannot be predicted
						} ,
						thumbnail: {
							contentType: "text/plain" ,
							filename: "thumbnail.png" ,
							extension: 'png' ,
							hashType: "sha256" ,
							hash: contentHashThumbnail ,
							fileSize: 40 ,
							metadata: {} ,
							publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.file.attachments.thumbnail.id ,
							id: data.file.attachments.thumbnail.id	// Cannot be predicted
						}
					} ,
					metadata: {}
				} ,
				arrayOfAttachments: [] ,
				arrayOfAttachmentSets: [] ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;

			getAttachmentQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~file/~thumbnail' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'x'.repeat( 40 ) ) ;

			// Should retrieve the correct hash
			expect( response.headers.digest ).to.be( 'sha-256=' + contentHashThumbnail ) ;
		} ) ;
	} ) ;



	describe( "Array of Attachment/AttachmentSet" , () => {

		it( "PUT in an array of Attachment of an existing document then GET it" , async function() {
			this.timeout( 4000 ) ;

			var response , data ,
				contentHash = crypto.createHash( 'sha256' ).update( 'z'.repeat( 40 ) ).digest( 'base64' ) ;
			
			var putQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					name: "image" ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;

			var putAttachmentQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachments.0' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream'
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'z'.charCodeAt( 0 ) , meta: { filename: 'image.png' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putAttachmentQuery ) ;
			expect( response.status ).to.be( 204 ) ;
			//console.log( "Response:" , response ) ;

			var getQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb8d7bd15a89dad7ba130" ,
				name: "image" ,
				slugId: data.slugId ,	// Cannot be predicted
				file: {
					attachments: {} ,
					metadata: {}
				} ,
				arrayOfAttachments: [
					{
						contentType: "text/plain" ,
						filename: "image.png" ,
						extension: 'png' ,
						hashType: "sha256" ,
						hash: contentHash ,
						fileSize: 40 ,
						metadata: {} ,
						publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachments[ 0 ].id ,
						id: data.arrayOfAttachments[ 0 ].id		// Cannot be predicted
					}
				] ,
				arrayOfAttachmentSets: [] ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;

			var getAttachmentQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachments.0' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'z'.repeat( 40 ) ) ;
			expect( response.headers['content-disposition'] ).to.be( "inline; filename=\"image.png\"; filename*=UTF-8''image.png" ) ;

			// Should retrieve the correct hash
			expect( response.headers.digest ).to.be( 'sha-256=' + contentHash ) ;

			var contentHash2 = crypto.createHash( 'sha256' ).update( 'x'.repeat( 40 ) ).digest( 'base64' ) ;

			putAttachmentQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachments.1' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream'
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'x'.charCodeAt( 0 ) , meta: { filename: 'image2.png' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putAttachmentQuery ) ;
			expect( response.status ).to.be( 204 ) ;


			getQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb8d7bd15a89dad7ba130" ,
				name: "image" ,
				slugId: data.slugId ,	// Cannot be predicted
				file: {
					attachments: {} ,
					metadata: {}
				} ,
				arrayOfAttachments: [
					{
						contentType: "text/plain" ,
						filename: "image.png" ,
						extension: 'png' ,
						hashType: "sha256" ,
						hash: contentHash ,
						fileSize: 40 ,
						metadata: {} ,
						publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachments[ 0 ].id ,
						id: data.arrayOfAttachments[ 0 ].id		// Cannot be predicted
					} ,
					{
						contentType: "text/plain" ,
						filename: "image2.png" ,
						extension: 'png' ,
						hashType: "sha256" ,
						hash: contentHash2 ,
						fileSize: 40 ,
						metadata: {} ,
						publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachments[ 1 ].id ,
						id: data.arrayOfAttachments[ 1 ].id	// Cannot be predicted
					}
				] ,
				arrayOfAttachmentSets: [] ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;
		} ) ;

		it( "PUT in an array of AttachmentSet of an existing document then GET it" , async function() {
			this.timeout( 6000 ) ;

			var response , data ,
				contentHash = crypto.createHash( 'sha256' ).update( 'z'.repeat( 40 ) ).digest( 'base64' ) ;
			
			var putQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					name: "image" ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			response = await requester( putQuery ) ;
			expect( response.status ).to.be( 201 ) ;
			//console.log( "Response:" , response ) ;

			var putAttachmentQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.0' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream'
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'z'.charCodeAt( 0 ) , meta: { filename: 'image.png' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putAttachmentQuery ) ;
			expect( response.status ).to.be( 204 ) ;

			var getQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb8d7bd15a89dad7ba130" ,
				name: "image" ,
				slugId: data.slugId ,	// Cannot be predicted
				file: {
					attachments: {} ,
					metadata: {}
				} ,
				arrayOfAttachments: [] ,
				arrayOfAttachmentSets: [
					{
						attachments: {
							source: {
								contentType: "text/plain" ,
								filename: "image.png" ,
								extension: 'png' ,
								hashType: "sha256" ,
								hash: contentHash ,
								fileSize: 40 ,
								metadata: {} ,
								publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachmentSets[ 0 ].attachments.source.id ,
								id: data.arrayOfAttachmentSets[ 0 ].attachments.source.id	// Cannot be predicted
							}
						} ,
						metadata: {}
					}
				] ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;

			var getAttachmentQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.0' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'z'.repeat( 40 ) ) ;

			// Should retrieve the correct hash
			expect( response.headers.digest ).to.be( 'sha-256=' + contentHash ) ;

			var contentHash2 = crypto.createHash( 'sha256' ).update( 'x'.repeat( 40 ) ).digest( 'base64' ) ;

			putAttachmentQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.1' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream'
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'x'.charCodeAt( 0 ) , meta: { filename: 'image2.png' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putAttachmentQuery ) ;
			expect( response.status ).to.be( 204 ) ;


			getQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb8d7bd15a89dad7ba130" ,
				name: "image" ,
				slugId: data.slugId ,	// Cannot be predicted
				file: {
					attachments: {} ,
					metadata: {}
				} ,
				arrayOfAttachments: [] ,
				arrayOfAttachmentSets: [
					{
						attachments: {
							source: {
								contentType: "text/plain" ,
								filename: "image.png" ,
								extension: 'png' ,
								hashType: "sha256" ,
								hash: contentHash ,
								fileSize: 40 ,
								metadata: {} ,
								publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachmentSets[ 0 ].attachments.source.id ,
								id: data.arrayOfAttachmentSets[ 0 ].attachments.source.id	// Cannot be predicted
							}
						} ,
						metadata: {}
					} ,
					{
						attachments: {
							source: {
								contentType: "text/plain" ,
								filename: "image2.png" ,
								extension: 'png' ,
								hashType: "sha256" ,
								hash: contentHash2 ,
								fileSize: 40 ,
								metadata: {} ,
								publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachmentSets[ 1 ].attachments.source.id ,
								id: data.arrayOfAttachmentSets[ 1 ].attachments.source.id	// Cannot be predicted
							}
						} ,
						metadata: {}
					}
				] ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;

			// New attachmentSet + set key

			var contentHash3 = crypto.createHash( 'sha256' ).update( 'k'.repeat( 40 ) ).digest( 'base64' ) ;

			putAttachmentQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.2/~archive' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream'
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'k'.charCodeAt( 0 ) , meta: { filename: 'image3.png' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putAttachmentQuery ) ;
			expect( response.status ).to.be( 204 ) ;


			getQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb8d7bd15a89dad7ba130" ,
				name: "image" ,
				slugId: data.slugId ,	// Cannot be predicted
				file: {
					attachments: {} ,
					metadata: {}
				} ,
				arrayOfAttachments: [] ,
				arrayOfAttachmentSets: [
					{
						attachments: {
							source: {
								contentType: "text/plain" ,
								filename: "image.png" ,
								extension: 'png' ,
								hashType: "sha256" ,
								hash: contentHash ,
								fileSize: 40 ,
								metadata: {} ,
								publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachmentSets[ 0 ].attachments.source.id ,
								id: data.arrayOfAttachmentSets[ 0 ].attachments.source.id	// Cannot be predicted
							}
						} ,
						metadata: {}
					} ,
					{
						attachments: {
							source: {
								contentType: "text/plain" ,
								filename: "image2.png" ,
								extension: 'png' ,
								hashType: "sha256" ,
								hash: contentHash2 ,
								fileSize: 40 ,
								metadata: {} ,
								publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachmentSets[ 1 ].attachments.source.id ,
								id: data.arrayOfAttachmentSets[ 1 ].attachments.source.id	// Cannot be predicted
							}
						} ,
						metadata: {}
					} ,
					{
						attachments: {
							archive: {
								contentType: "text/plain" ,
								filename: "image3.png" ,
								extension: 'png' ,
								hashType: "sha256" ,
								hash: contentHash3 ,
								fileSize: 40 ,
								metadata: {} ,
								publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachmentSets[ 2 ].attachments.archive.id ,
								id: data.arrayOfAttachmentSets[ 2 ].attachments.archive.id	// Cannot be predicted
							}
						} ,
						metadata: {}
					}
				] ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;

			// Existing attachmentSet + set key

			var contentHash4 = crypto.createHash( 'sha256' ).update( 'w'.repeat( 40 ) ).digest( 'base64' ) ;
			var contentHash5 = crypto.createHash( 'sha256' ).update( 'y'.repeat( 40 ) ).digest( 'base64' ) ;

			putAttachmentQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.2/~thumbnail' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream'
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'w'.charCodeAt( 0 ) , meta: { filename: 'image4.png' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putAttachmentQuery ) ;
			expect( response.status ).to.be( 204 ) ;

			putAttachmentQuery = {
				method: 'PUT' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.0/~small' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/octet-stream'
				} ,
				body: new streamKit.FakeReadable( {
					timeout: 20 , chunkSize: 10 , chunkCount: 4 , filler: 'y'.charCodeAt( 0 ) , meta: { filename: 'image5.png' , contentType: 'text/plain' }
				} )
			} ;

			response = await requester( putAttachmentQuery ) ;
			expect( response.status ).to.be( 204 ) ;


			getQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: "543bb8d7bd15a89dad7ba130" ,
				name: "image" ,
				slugId: data.slugId ,	// Cannot be predicted
				file: {
					attachments: {} ,
					metadata: {}
				} ,
				arrayOfAttachments: [] ,
				arrayOfAttachmentSets: [
					{
						attachments: {
							source: {
								contentType: "text/plain" ,
								filename: "image.png" ,
								extension: 'png' ,
								hashType: "sha256" ,
								hash: contentHash ,
								fileSize: 40 ,
								metadata: {} ,
								publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachmentSets[ 0 ].attachments.source.id ,
								id: data.arrayOfAttachmentSets[ 0 ].attachments.source.id	// Cannot be predicted
							} ,
							small: {
								contentType: "text/plain" ,
								filename: "image5.png" ,
								extension: 'png' ,
								hashType: "sha256" ,
								hash: contentHash5 ,
								fileSize: 40 ,
								metadata: {} ,
								publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachmentSets[ 0 ].attachments.small.id ,
								id: data.arrayOfAttachmentSets[ 0 ].attachments.small.id	// Cannot be predicted
							}
						} ,
						metadata: {}
					} ,
					{
						attachments: {
							source: {
								contentType: "text/plain" ,
								filename: "image2.png" ,
								extension: 'png' ,
								hashType: "sha256" ,
								hash: contentHash2 ,
								fileSize: 40 ,
								metadata: {} ,
								publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachmentSets[ 1 ].attachments.source.id ,
								id: data.arrayOfAttachmentSets[ 1 ].attachments.source.id	// Cannot be predicted
							}
						} ,
						metadata: {}
					} ,
					{
						attachments: {
							archive: {
								contentType: "text/plain" ,
								filename: "image3.png" ,
								extension: 'png' ,
								hashType: "sha256" ,
								hash: contentHash3 ,
								fileSize: 40 ,
								metadata: {} ,
								publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachmentSets[ 2 ].attachments.archive.id ,
								id: data.arrayOfAttachmentSets[ 2 ].attachments.archive.id	// Cannot be predicted
							} ,
							thumbnail: {
								contentType: "text/plain" ,
								filename: "image4.png" ,
								extension: 'png' ,
								hashType: "sha256" ,
								hash: contentHash4 ,
								fileSize: 40 ,
								metadata: {} ,
								publicUrl: PUBLIC_URL + '/images/543bb8d7bd15a89dad7ba130/' + data.arrayOfAttachmentSets[ 2 ].attachments.thumbnail.id ,
								id: data.arrayOfAttachmentSets[ 2 ].attachments.thumbnail.id	// Cannot be predicted
							}
						} ,
						metadata: {}
					}
				] ,
				parent: {
					collection: 'root' ,
					id: '/'
				}
			} ) ;
			

			// Get (check) all files

			getAttachmentQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.0' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'z'.repeat( 40 ) ) ;

			getAttachmentQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.0/~source' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'z'.repeat( 40 ) ) ;

			getAttachmentQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.0/~small' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'y'.repeat( 40 ) ) ;

			getAttachmentQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.1/~source' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'x'.repeat( 40 ) ) ;

			getAttachmentQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.2/~archive' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'k'.repeat( 40 ) ) ;

			getAttachmentQuery = {
				method: 'GET' ,
				path: '/Images/543bb8d7bd15a89dad7ba130/~arrayOfAttachmentSets.2/~thumbnail' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getAttachmentQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be( 'w'.repeat( 40 ) ) ;
		} ) ;
	} ) ;



	describe( "Links population" , () => {

		it( "GET on document and collection + populate links" , async () => {
			var response , data , u1 , u2 , u3 ;

			var postQuery1 = {
				method: 'POST' ,
				path: '/Users' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					firstName: "Big Joe" ,
					lastName: "Doe" ,
					email: "big.joe.doe@gmail.com" ,
					password: "pw" ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			var postQuery2 = {
				method: 'POST' ,
				path: '/Users' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					firstName: "THE" ,
					lastName: "GODFATHER" ,
					email: "godfather@gmail.com" ,
					password: "pw" ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			var postQuery3 , getQuery ;
			
			response = await requester( postQuery1 ) ;
			expect( response.status ).to.be( 201 ) ;
			u1 = JSON.parse( response.body ).id ;
			
			response = await requester( postQuery2 ) ;
			expect( response.status ).to.be( 201 ) ;
			u2 = JSON.parse( response.body ).id ;

			var postQuery3 = {
				method: 'POST' ,
				path: '/Users' ,
				headers: {
					Host: 'localhost' ,
					"content-type": 'application/json'
				} ,
				body: {
					firstName: "Joe" ,
					lastName: "Doe" ,
					email: "joe.doe@gmail.com" ,
					password: "pw" ,
					father: u1 ,
					godfather: u2 ,
					friends: [] ,
					publicAccess: { traverse: true , read: true , create: true }
				}
			} ;

			response = await requester( postQuery3 ) ;
			expect( response.status ).to.be( 201 ) ;
			u3 = JSON.parse( response.body ).id ;
			
			var getQuery = {
				method: 'GET' ,
				path: '/Users/' + u3 + '?populate=[father,godfather]' ,
				headers: {
					Host: 'localhost'
				}
			} ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			delete data.father.password ;
			delete data.godfather.password ;
			expect( data ).to.equal( {
				_id: data._id ,
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				login: "joe.doe@gmail.com" ,
				slugId: data.slugId ,	// Cannot be predicted
				hid: "Joe Doe" ,
				//groups: {} ,
				parent: {
					collection: 'root' ,
					id: '/'
				} ,
				father: {
					_id: data.father._id ,
					firstName: "Big Joe" ,
					lastName: "Doe" ,
					email: "big.joe.doe@gmail.com" ,
					login: "big.joe.doe@gmail.com" ,
					friends: [] ,
					slugId: data.father.slugId ,
					hid: "Big Joe Doe" ,
					//groups: {} ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				godfather: {
					_id: data.godfather._id ,
					firstName: "THE" ,
					lastName: "GODFATHER" ,
					email: "godfather@gmail.com" ,
					login: "godfather@gmail.com" ,
					friends: [] ,
					slugId: data.godfather.slugId ,
					hid: "THE GODFATHER" ,
					//groups: {} ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				friends: []
			} ) ;
			
			getQuery = {
				method: 'GET' ,
				path: '/Users/' + u3 + '?populate=[father,godfather]&access=all&pAccess=all' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: data._id ,
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				login: "joe.doe@gmail.com" ,
				slugId: data.slugId ,	// Cannot be predicted
				hid: "Joe Doe" ,
				groups: {} ,
				parent: {
					collection: 'root' ,
					id: '/'
				} ,
				publicAccess: {
					create: true ,
					read: true ,
					traverse: true
				} ,
				userAccess: {} ,
				groupAccess: {} ,
				father: {
					_id: data.father._id ,
					firstName: "Big Joe" ,
					lastName: "Doe" ,
					email: "big.joe.doe@gmail.com" ,
					login: "big.joe.doe@gmail.com" ,
					friends: [] ,
					slugId: data.father.slugId ,
					hid: "Big Joe Doe" ,
					groups: {} ,
					userAccess: {} ,
					groupAccess: {} ,
					publicAccess: { traverse: true , read: true , create: true } ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				godfather: {
					_id: data.godfather._id ,
					firstName: "THE" ,
					lastName: "GODFATHER" ,
					email: "godfather@gmail.com" ,
					login: "godfather@gmail.com" ,
					friends: [] ,
					slugId: data.godfather.slugId ,
					hid: "THE GODFATHER" ,
					groups: {} ,
					userAccess: {} ,
					groupAccess: {} ,
					publicAccess: { traverse: true , read: true , create: true } ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				friends: []
			} ) ;
			
			getQuery = {
				method: 'GET' ,
				path: '/Users/' + u3 + '?populate=[father,godfather]&access=all&pAccess=id' ,
				headers: {
					Host: 'localhost'
				}
			} ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				_id: data._id ,
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				login: "joe.doe@gmail.com" ,
				slugId: data.slugId ,	// Cannot be predicted
				hid: "Joe Doe" ,
				groups: {} ,
				parent: {
					collection: 'root' ,
					id: '/'
				} ,
				publicAccess: {
					create: true ,
					read: true ,
					traverse: true
				} ,
				userAccess: {} ,
				groupAccess: {} ,
				father: {
					_id: data.father._id ,
					slugId: "big-joe-doe" ,
					hid: "Big Joe Doe" ,
					login: "big.joe.doe@gmail.com" ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				godfather: {
					_id: data.godfather._id ,
					slugId: "the-godfather" ,
					hid: "THE GODFATHER" ,
					login: "godfather@gmail.com" ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				friends: []
			} ) ;

			// Check different access
			getQuery = {
				method: 'GET' ,
				path: '/Users/' + u3 + '?populate=[father,godfather]&access=content&pAccess=id' ,
				headers: {
					Host: 'localhost'
				}
			} ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				father: {
					_id: data.father._id ,
					slugId: "big-joe-doe" ,
					hid: "Big Joe Doe" ,
					login: "big.joe.doe@gmail.com" ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				godfather: {
					_id: data.godfather._id ,
					slugId: "the-godfather" ,
					hid: "THE GODFATHER" ,
					login: "godfather@gmail.com" ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				friends: []
			} ) ;

			// Check if pAccess uses access tags if not defined
			getQuery = {
				method: 'GET' ,
				path: '/Users/' + u3 + '?populate=[father,godfather]&access=content' ,
				headers: {
					Host: 'localhost'
				}
			} ;
			
			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			expect( data ).to.equal( {
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				father: {
					email: "big.joe.doe@gmail.com" ,
					firstName: "Big Joe" ,
					lastName: "Doe" ,
					friends: []
				} ,
				godfather: {
					email: "godfather@gmail.com" ,
					firstName: "THE" ,
					lastName: "GODFATHER" ,
					friends: []
				} ,
				friends: []
			} ) ;

			getQuery = {
				method: 'GET' ,
				path: '/Users?populate=[father,godfather]' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			data.sort( ( a , b ) => a.firstName.charCodeAt( 0 ) - b.firstName.charCodeAt( 0 ) ) ;
			expect( data ).to.equal( [
				{
					_id: data[ 0 ]._id ,
					firstName: "Big Joe" ,
					lastName: "Doe" ,
					email: "big.joe.doe@gmail.com" ,
					login: "big.joe.doe@gmail.com" ,
					slugId: data[ 0 ].slugId ,
					hid: "Big Joe Doe" ,
					//groups: {} ,
					//father: null, godfather: null,
					friends: [] ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				{
					_id: data[ 1 ]._id ,
					firstName: "Joe" ,
					lastName: "Doe" ,
					email: "joe.doe@gmail.com" ,
					login: "joe.doe@gmail.com" ,
					slugId: data[ 1 ].slugId ,	// Cannot be predicted
					hid: "Joe Doe" ,
					//groups: {} ,
					parent: {
						collection: 'root' ,
						id: '/'
					} ,
					father: {
						_id: data[ 0 ]._id ,
						firstName: "Big Joe" ,
						lastName: "Doe" ,
						email: "big.joe.doe@gmail.com" ,
						login: "big.joe.doe@gmail.com" ,
						friends: [] ,
						slugId: data[ 0 ].slugId ,
						hid: "Big Joe Doe" ,
						//groups: {} ,
						parent: {
							collection: 'root' ,
							id: "/"
						}
					} ,
					godfather: {
						_id: data[ 2 ]._id ,
						firstName: "THE" ,
						lastName: "GODFATHER" ,
						email: "godfather@gmail.com" ,
						login: "godfather@gmail.com" ,
						friends: [] ,
						slugId: data[ 2 ].slugId ,
						hid: "THE GODFATHER" ,
						//groups: {} ,
						parent: {
							collection: 'root' ,
							id: "/"
						}
					} ,
					friends: []
				} ,
				{
					_id: data[ 2 ]._id ,
					firstName: "THE" ,
					lastName: "GODFATHER" ,
					email: "godfather@gmail.com" ,
					login: "godfather@gmail.com" ,
					slugId: data[ 2 ].slugId ,
					hid: "THE GODFATHER" ,
					//groups: {} ,
					//father: null, godfather: null,
					friends: [] ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				}
			] ) ;

			getQuery = {
				method: 'GET' ,
				path: '/Users?populate=[father,godfather]&access=all&pAccess=all' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			data.sort( ( a , b ) => a.firstName.charCodeAt( 0 ) - b.firstName.charCodeAt( 0 ) ) ;
			delete data[ 0 ].password ;
			delete data[ 1 ].password ;
			delete data[ 1 ].father.password ;
			delete data[ 1 ].godfather.password ;
			delete data[ 2 ].password ;
			expect( data ).to.equal( [
				{
					_id: data[ 0 ]._id ,
					firstName: "Big Joe" ,
					lastName: "Doe" ,
					email: "big.joe.doe@gmail.com" ,
					login: "big.joe.doe@gmail.com" ,
					friends: [] ,
					slugId: data[ 0 ].slugId ,
					hid: "Big Joe Doe" ,
					groups: {} ,
					//father: null, godfather: null,
					friends: [] ,
					userAccess: {} ,
					groupAccess: {} ,
					publicAccess: { traverse: true , read: true , create: true } ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				{
					_id: data[ 1 ]._id ,
					firstName: "Joe" ,
					lastName: "Doe" ,
					email: "joe.doe@gmail.com" ,
					login: "joe.doe@gmail.com" ,
					friends: [] ,
					slugId: data[ 1 ].slugId ,	// Cannot be predicted
					hid: "Joe Doe" ,
					groups: {} ,
					userAccess: {} ,
					groupAccess: {} ,
					publicAccess: { traverse: true , read: true , create: true } ,
					parent: {
						collection: 'root' ,
						id: '/'
					} ,
					father: {
						_id: data[ 0 ]._id ,
						firstName: "Big Joe" ,
						lastName: "Doe" ,
						email: "big.joe.doe@gmail.com" ,
						login: "big.joe.doe@gmail.com" ,
						friends: [] ,
						slugId: data[ 0 ].slugId ,
						hid: "Big Joe Doe" ,
						groups: {} ,
						userAccess: {} ,
						groupAccess: {} ,
						publicAccess: { traverse: true , read: true , create: true } ,
						parent: {
							collection: 'root' ,
							id: "/"
						}
					} ,
					godfather: {
						_id: data[ 2 ]._id ,
						firstName: "THE" ,
						lastName: "GODFATHER" ,
						email: "godfather@gmail.com" ,
						login: "godfather@gmail.com" ,
						friends: [] ,
						slugId: data[ 2 ].slugId ,
						hid: "THE GODFATHER" ,
						groups: {} ,
						userAccess: {} ,
						groupAccess: {} ,
						publicAccess: { traverse: true , read: true , create: true } ,
						parent: {
							collection: 'root' ,
							id: "/"
						}
					} ,
					friends: []
				} ,
				{
					_id: data[ 2 ]._id ,
					firstName: "THE" ,
					lastName: "GODFATHER" ,
					email: "godfather@gmail.com" ,
					login: "godfather@gmail.com" ,
					friends: [] ,
					slugId: data[ 2 ].slugId ,
					hid: "THE GODFATHER" ,
					groups: {} ,
					//father: null, godfather: null,
					friends: [] ,
					userAccess: {} ,
					groupAccess: {} ,
					publicAccess: { traverse: true , read: true , create: true } ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				}
			] ) ;

			getQuery = {
				method: 'GET' ,
				path: '/Users?populate=[father,godfather]&access=all&pAccess=id' ,
				headers: {
					Host: 'localhost'
				}
			} ;

			response = await requester( getQuery ) ;
			expect( response.status ).to.be( 200 ) ;
			expect( response.body ).to.be.ok() ;
			data = JSON.parse( response.body ) ;
			data.sort( ( a , b ) => a.firstName.charCodeAt( 0 ) - b.firstName.charCodeAt( 0 ) ) ;
			delete data[ 0 ].password ;
			delete data[ 1 ].password ;
			delete data[ 2 ].password ;
			expect( data ).to.equal( [
				{
					_id: data[ 0 ]._id ,
					firstName: "Big Joe" ,
					lastName: "Doe" ,
					email: "big.joe.doe@gmail.com" ,
					login: "big.joe.doe@gmail.com" ,
					slugId: data[ 0 ].slugId ,
					hid: "Big Joe Doe" ,
					groups: {} ,
					//father: null, godfather: null,
					friends: [] ,
					userAccess: {} ,
					groupAccess: {} ,
					publicAccess: { traverse: true , read: true , create: true } ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				{
					_id: data[ 1 ]._id ,
					firstName: "Joe" ,
					lastName: "Doe" ,
					email: "joe.doe@gmail.com" ,
					login: "joe.doe@gmail.com" ,
					slugId: data[ 1 ].slugId ,	// Cannot be predicted
					groups: {} ,
					hid: "Joe Doe" ,
					userAccess: {} ,
					groupAccess: {} ,
					publicAccess: { traverse: true , read: true , create: true } ,
					parent: {
						collection: 'root' ,
						id: '/'
					} ,
					father: {
						_id: data[ 0 ]._id ,
						login: "big.joe.doe@gmail.com" ,
						slugId: "big-joe-doe" ,
						hid: "Big Joe Doe" ,
						parent: {
							collection: 'root' ,
							id: "/"
						}
					} ,
					godfather: {
						_id: data[ 2 ]._id ,
						slugId: "the-godfather" ,
						hid: "THE GODFATHER" ,
						login: "godfather@gmail.com" ,
						parent: {
							collection: 'root' ,
							id: "/"
						}
					} ,
					friends: []
				} ,
				{
					_id: data[ 2 ]._id ,
					firstName: "THE" ,
					lastName: "GODFATHER" ,
					email: "godfather@gmail.com" ,
					login: "godfather@gmail.com" ,
					slugId: data[ 2 ].slugId ,
					hid: "THE GODFATHER" ,
					groups: {} ,
					//father: null, godfather: null,
					friends: [] ,
					userAccess: {} ,
					groupAccess: {} ,
					publicAccess: { traverse: true , read: true , create: true } ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				}
			] ) ;
		} ) ;

		it( "Populate * test (TODO!)" ) ;
	} ) ;
} ) ;

