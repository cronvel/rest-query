/*
	Rest Query

	Copyright (c) 2014 - 2019 Cédric Ronvel

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



var cli = getCliOptions() ;

var restQuery = require( '..' ) ;

var http = require( 'http' ) ;
var childProcess = require( 'child_process' ) ;
var mongodb = require( 'mongodb' ) ;


var Promise = require( 'seventh' ) ;
var tree = require( 'tree-kit' ) ;
var fsKit = require( 'fs-kit' ) ;

var appProto = 'http' ;
var appPort = 1234 ;
var appProcess ;
var dbUrl = 'mongodb://localhost:27017/restQuery' ;
var db ;

var Logfella = require( 'logfella' ) ;
var log = Logfella.global.use( 'unit-test' ) ;




/* Utils */



// it flatten prototype chain, so a single object owns every property of its parents
var protoflatten = tree.extend.bind( undefined , { deep: true , immutables: [ mongodb.ObjectID.prototype ] } , null ) ;



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
	if ( cli.log ) { console.log( ... arguments ) ; }
}



// clear DB: remove every item, so we can safely test
function clearDB() {
	return Promise.all( [
		clearCollection( 'root' ) ,
		clearCollection( 'blogs' ) ,
		clearCollection( 'posts' ) ,
		clearCollection( 'comments' ) ,
		clearCollection( 'users' )
	] ) ;
}



async function clearCollection( collectionName ) {
	var collection = db.collection( collectionName ) ;
	await collection.deleteMany() ;
	
	// ??? this is a mongo collection node not a restquery collection
	//if ( collection.attachmentUrl ) { fsKit.deltree( collection.attachmentUrl , callback ) ; } 
}



function connect() {
	return mongodb.MongoClient.connect( dbUrl , { useNewUrlParser: true } ).then( client => {
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
			'--buildIndexes'
		] ,
		{ stdio: 'pipe' }
	) ;

	// Exists with .spawn() but not with .fork() unless stdio: 'pipe' is used
	appProcess.stdout.on( 'data' , data => {
		//console.log( "[appProcess STDOUT] " , data.toString() ) ;
	} ) ;

	appProcess.stderr.on( 'data' , data => {
		//console.log( "[appProcess STDERR] " , data.toString() ) ;
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



function requester( query ) {
	var promise = new Promise() ;
	
	query = tree.extend( null , { hostname: 'localhost' , port: appPort } , query ) ;

	if ( query.body ) { query.headers['Content-Length'] = query.body.length ; }

	var request = http.request( query , ( response ) => {
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

	// Write .body... erf... to request body
	if ( query.body ) {
		//console.log( "BODY to send:" , query.body ) ;
		request.write( query.body ) ;
	}
	
	request.end() ;
	
	return promise ;
}





/* Hooks */



before( () => {
	return Promise.all( [ connect() , runApp() ] ) ;
} ) ;



after( () => {
	return killApp() ;
} ) ;



beforeEach( clearDB ) ;





/* Tests */



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
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "My website!" ,
				description: "... about my wonderful life" ,
				publicAccess: { traverse: true , read: true , create: true }
			} )
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
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "My website!" ,
				description: "... about my wonderful life" ,
				publicAccess: { traverse: true , read: true , create: true }
			} )
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
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "My website!" ,
				description: "... about my wonderful life" ,
					publicAccess: {
					traverse: true , read: true , write: true , delete: true , create: true
				}
			} )
		} ;

		var patchQuery = {
			method: 'PATCH' ,
			path: '/Blogs/543bb877bd15489d0d7b0121' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "My *NEW* website!" ,
				description: "... about my wonderful life"
			} )
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
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "My website!" ,
				description: "... about my wonderful life" ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , create: true
				}
			} )
		} ;

		var deleteQuery = {
			method: 'DELETE' ,
			path: '/Blogs/543bb877bd15489d0d7b0122' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
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
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "First post!" ,
				description: "Everything started with that."
			} )
		} ;

		var putQuery2 = {
			method: 'PUT' ,
			path: '/Blogs/543bb877bd15489d0d7b0122' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "About" ,
				description: "About this blog."
			} )
		} ;

		var putQuery3 = {
			method: 'PUT' ,
			path: '/Blogs/543bb877bd15489d0d7b0123' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "10 things about nothing" ,
				description: "10 things you should know... or not..."
			} )
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
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				firstName: "Joe" ,
				lastName: "Doe2" ,
				email: "joe.doe2@gmail.com" ,
				password: "pw" ,
				publicAccess: { traverse: true , read: true , create: true }
			} )
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
			//groups: {} ,
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
			_id: "543bb877bd15489d0d7b0130" ,
			firstName: "Joe" ,
			lastName: "Doe2" ,
			email: "joe.doe2@gmail.com" ,
			login: "joe.doe2@gmail.com" ,
			groups: {} ,
			slugId: data.slugId ,	// Cannot be predicted
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
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				firstName: "John" ,
				lastName: "Doe" ,
				email: "john.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , create: true
				}
			} )
		} ;

		var deleteQuery = {
			method: 'DELETE' ,
			path: '/Users/543bb877bd15489d0d7b0132' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
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

	it( "Attachment tests..." ) ;
} ) ;



describe( "Links population" , () => {

	it( "GET on document and collection + populate links" , async () => {
		var response , data , u1 , u2 , u3 ;

		var postQuery1 = {
			method: 'POST' ,
			path: '/Users' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				firstName: "Big Joe" ,
				lastName: "Doe" ,
				email: "big.joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: { traverse: true , read: true , create: true }
			} )
		} ;

		var postQuery2 = {
			method: 'POST' ,
			path: '/Users' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: { traverse: true , read: true , create: true }
			} )
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
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				father: u1 ,
				godfather: u2 ,
				publicAccess: { traverse: true , read: true , create: true }
			} )
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
				slugId: data.father.slugId ,
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
				slugId: data.godfather.slugId ,
				//groups: {} ,
				parent: {
					collection: 'root' ,
					id: "/"
				}
			}
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
				slugId: data.father.slugId ,
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
				slugId: data.godfather.slugId ,
				groups: {} ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: { traverse: true , read: true , create: true } ,
				parent: {
					collection: 'root' ,
					id: "/"
				}
			}
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
				login: "big.joe.doe@gmail.com" ,
				parent: {
					collection: 'root' ,
					id: "/"
				}
			} ,
			godfather: {
				_id: data.godfather._id ,
				slugId: "the-godfather" ,
				login: "godfather@gmail.com" ,
				parent: {
					collection: 'root' ,
					id: "/"
				}
			}
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
				//groups: {} ,
				//father: null, godfather: null,
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
					slugId: data[ 0 ].slugId ,
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
					slugId: data[ 2 ].slugId ,
					//groups: {} ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				}
			} ,
			{
				_id: data[ 2 ]._id ,
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				login: "godfather@gmail.com" ,
				slugId: data[ 2 ].slugId ,
				//groups: {} ,
				//father: null, godfather: null,
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
				slugId: data[ 0 ].slugId ,
				groups: {} ,
				//father: null, godfather: null,
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
					slugId: data[ 0 ].slugId ,
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
					slugId: data[ 2 ].slugId ,
					groups: {} ,
					userAccess: {} ,
					groupAccess: {} ,
					publicAccess: { traverse: true , read: true , create: true } ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				}
			} ,
			{
				_id: data[ 2 ]._id ,
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				login: "godfather@gmail.com" ,
				slugId: data[ 2 ].slugId ,
				groups: {} ,
				//father: null, godfather: null,
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
				groups: {} ,
				//father: null, godfather: null,
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
					parent: {
						collection: 'root' ,
						id: "/"
					}
				} ,
				godfather: {
					_id: data[ 2 ]._id ,
					slugId: "the-godfather" ,
					login: "godfather@gmail.com" ,
					parent: {
						collection: 'root' ,
						id: "/"
					}
				}
			} ,
			{
				_id: data[ 2 ]._id ,
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				login: "godfather@gmail.com" ,
				slugId: data[ 2 ].slugId ,
				groups: {} ,
				//father: null, godfather: null,
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
} ) ;

