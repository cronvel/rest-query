/*
	The Cedric's Swiss Knife (CSK) - CSK REST Query test suite

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

/* jshint unused:false */
/* global describe, it, before, after */



var cli = getCliOptions() ;

var smartPreprocessor = require( 'smart-preprocessor' ) ;
var restQuery = cli['log-lib'] ?
	smartPreprocessor.require( __dirname + '/../lib/restQuery.js' , { debug: true } ) :
	require( '../lib/restQuery.js' ) ;

var config = require( './sample/app-config.js' ) ;

var expect = require( 'expect.js' ) ;

var http = require( 'http' ) ;
var childProcess = require( 'child_process' ) ;
var mongodb = require( 'mongodb' ) ;


var async = require( 'async-kit' ) ;
var tree = require( 'tree-kit' ) ;

var appProto = 'http' ;
var appPort = 1234 ;
var appProcess ;
var dbUrl = 'mongodb://localhost:27017/restQuery' ;
var db ;




			/* Utils */



// it flatten prototype chain, so a single object owns every property of its parents
var protoflatten = tree.extend.bind( undefined , { deep: true , deepFilter: { blacklist: [ mongodb.ObjectID.prototype ] } } , null ) ;



// Return options while trying to avoid mocha's parameters
function getCliOptions()
{
	var i , max = 0 ;
	
	for ( i = 2 ; i < process.argv.length ; i ++ )
	{
		if ( process.argv[ i ].match( /\*|.+\.js/ ) )
		{
			max = i ;
		}
	}
	
	return require( 'minimist' )( process.argv.slice( max + 1 ) ) ;
}



function debug()
{
	if ( cli.log ) { console.log.apply( console , arguments ) ; }
}



// clear DB: remove every item, so we can safely test
function clearDB( callback )
{
	async.parallel( [
		[ clearCollection , 'blogs' ] ,
		[ clearCollection , 'posts' ] ,
		[ clearCollection , 'comments' ] ,
		[ clearCollection , 'users' ]
	] )
	.exec( callback ) ;
}



function clearCollection( collectionName , callback )
{
	var collection = db.collection( collectionName ) ;
	collection.remove( callback ) ;
}



function connect( callback )
{
	mongodb.MongoClient.connect( dbUrl , function( error , db_ ) {
		if ( error ) { callback( error ) ; return ; }
		db = db_ ;
		callback() ;
	} ) ;
}



function runApp( maybeCallback )
{
	appProcess = childProcess.spawn( 'node' , [ __dirname + '/sample/app-server.js' , appPort ] ) ;
	
	appProcess.stdout.on( 'data' , function( data ) {
		//console.log( "[appProcess STDOUT] " , data.toString() ) ;
	} ) ;
	
	appProcess.stderr.on( 'data' , function( data ) {
		//console.log( "[appProcess STDERR] " , data.toString() ) ;
	} ) ;
	
	appProcess.on( 'exit' , function( code ) {
		console.log( '[appProcess exit] ' + code ) ;
	} ) ;
	
	// Okay, we have no way to know if the app is ready, except to send it command,
	// it's way out of the scope of this test suite, so we just hope it is ready after 250ms
	setTimeout( maybeCallback , 500 ) ;
}



function killApp( maybeCallback )
{
	appProcess.kill( 'SIGKILL' ) ;
	
	// Expect the app to be killed within 100ms
	setTimeout( maybeCallback , 100 ) ;
}



function requester( query , callback )
{
	query = tree.extend( null , { hostname: 'localhost' , port: appPort } , query ) ;
	
	if ( query.body ) { query.headers['Content-Length'] = query.body.length ; }
	
	var request = http.request( query , function( response ) {
		
		var body = '' ;
		
		//console.log( '[requester] STATUS: ' + response.statusCode ) ;
		//console.log( '[requester] HEADERS: ' + JSON.stringify( response.headers ) ) ;
		response.setEncoding( 'utf8' ) ;
		
		response.on( 'data', function ( chunk ) {
			body += chunk.toString() ;
			//console.log( '[requester] BODY: ' + chunk ) ;
		} ) ;
		
		response.on( 'end' , function() {
			//console.log( 'END' ) ;
			callback( undefined , {
				httpVersion: response.httpVersion ,
				status: response.statusCode ,
				headers: response.headers ,
				body: body
			} ) ;
		} ) ;
	} ) ;
	
	request.on( 'error' , function( error ) {
		//console.log( '[requester] problem with request: ' + error.message ) ;
		callback( error ) ;
	} ) ;
	
	// Write .body... erf... to request body
	if ( query.body ) {
		//console.log( "BODY to send:" , query.body ) ;
		request.write( query.body ) ;
	}
	request.end() ;
}





			/* Hooks */



before( function( done ) {
	async.parallel( [ connect , runApp ] ).exec( done ) ;
} ) ;



after( function( done ) {
	killApp( done ) ;
} ) ;



beforeEach( clearDB ) ;





			/* Tests */



describe( "Basics tests" , function() {
	
	it( "GET on an unexistant blog" , function( done ) {
		
		var getQuery = {
			method: 'GET' ,
			path: '/Blogs/111111111111111111111111' ,
			headers: {
				Host: 'localhost'
			}
		} ;
		
		requester( getQuery , function( error , response ) {
			
			expect( error ).not.to.be.ok() ;
			expect( response.status ).to.be( 404 ) ;
			expect( response.body ).not.to.be.ok() ;
			
			//console.log( "Response:" , response ) ;
			
			done() ;
		} ) ;
	} ) ;
	
	it( "PUT then GET on a blog" , function( done ) {
		
		var putQuery = {
			method: 'PUT' ,
			path: '/Blogs/543bb877bd15489d0d7b0120' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "My website!",
				description: "... about my wonderful life"
			} )
		} ;
		
		var getQuery = {
			method: 'GET' ,
			path: '/Blogs/543bb877bd15489d0d7b0120' ,
			headers: {
				Host: 'localhost'
			}
		} ;
		
		async.series( [
			function( callback ) {
				requester( putQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 201 ) ;
					
					//console.log( "Response:" , response ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					expect( data ).to.be.eql( {
						_id: "543bb877bd15489d0d7b0120",
						title: "My website!",
						description: "... about my wonderful life",
						slugId: data.slugId,	// Cannot be predicted
						userAccess: {},
						groupAccess: {},
						otherAccess: restQuery.accessLevel.READ,
						inheritAccess: 'none',
						parent: {
							collection: null,
							id: '/'
						}
					} ) ;
					
					//console.log( "Response:" , response ) ;
					
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
		
	} ) ;
	
	it( "POST then GET on a blog" , function( done ) {
		
		var postDocument ;
		
		var postQuery = {
			method: 'POST' ,
			path: '/Blogs' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "My website!",
				description: "... about my wonderful life"
			} )
		} ;
		
		var getQuery = {
			method: 'GET' ,
			path: '/Blogs/' ,	// this should be completed with the ID after the POST
			headers: {
				Host: 'localhost'
			}
		} ;
		
		async.series( [
			function( callback ) {
				requester( postQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 201 ) ;
					
					//console.log( "Response:" , response ) ;
					postDocument = JSON.parse( response.body ) ;
					
					expect( typeof postDocument.id ).to.be( 'string' ) ;
					expect( postDocument.id.length ).to.be( 24 ) ;
					
					//console.log( response.headers.location ) ;
					expect( response.headers.location ).to.be( appProto + '://localhost:' + appPort + '/Blogs/' + postDocument.id ) ;
					
					getQuery.path += postDocument.id ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					expect( data ).to.be.eql( {
						_id: postDocument.id,
						title: "My website!",
						description: "... about my wonderful life",
						slugId: data.slugId,	// Cannot be predicted
						userAccess: {},
						groupAccess: {},
						otherAccess: restQuery.accessLevel.READ,
						inheritAccess: 'none',
						parent: {
							collection: null,
							id: '/'
						}
					} ) ;
					
					//console.log( "Response:" , response ) ;
					
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
		
	} ) ;
	
	it( "PUT, PATCH then GET on a blog" , function( done ) {
		
		var putQuery = {
			method: 'PUT' ,
			path: '/Blogs/543bb877bd15489d0d7b0121' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "My website!",
				description: "... about my wonderful life",
				otherAccess: restQuery.accessLevel.ALL
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
				title: "My *NEW* website!",
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
		
		async.series( [
			function( callback ) {
				requester( putQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 201 ) ;
					
					//console.log( "Response:" , response ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( patchQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					//console.log( "Response:" , response ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					expect( data ).to.be.eql( {
						_id: "543bb877bd15489d0d7b0121",
						title: "My *NEW* website!",
						description: "... about my wonderful life",
						slugId: data.slugId,	// Cannot be predicted
						userAccess: {},
						groupAccess: {},
						otherAccess: restQuery.accessLevel.ALL,
						inheritAccess: 'none',
						parent: {
							collection: null,
							id: '/'
						}
					} ) ;
					
					//console.log( "Response:" , response ) ;
					
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
		
	} ) ;
	
	it( "PUT, DELETE then GET on a blog" , function( done ) {
		
		var putQuery = {
			method: 'PUT' ,
			path: '/Blogs/543bb877bd15489d0d7b0122' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "My website!",
				description: "... about my wonderful life",
				otherAccess: restQuery.accessLevel.ALL
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
		
		async.series( [
			function( callback ) {
				requester( putQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 201 ) ;
					
					//console.log( "Response:" , response ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( deleteQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					//console.log( "Response:" , response ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 404 ) ;
					expect( response.body ).not.to.be.ok() ;
					
					//console.log( "Response:" , response ) ;
					
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
		
	} ) ;
	
} ) ;



describe( "Basics tests on users" , function() {
	
	it( "GET on an unexistant user" , function( done ) {
		
		var getQuery = {
			method: 'GET' ,
			path: '/Users/111111111111111111111111' ,
			headers: {
				Host: 'localhost'
			}
		} ;
		
		requester( getQuery , function( error , response ) {
			
			expect( error ).not.to.be.ok() ;
			expect( response.status ).to.be( 404 ) ;
			expect( response.body ).not.to.be.ok() ;
			
			//console.log( "Response:" , response ) ;
			
			done() ;
		} ) ;
	} ) ;
	
	it( "PUT then GET on a user" , function( done ) {
		
		var putQuery = {
			method: 'PUT' ,
			path: '/Users/543bb877bd15489d0d7b0130' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				firstName: "Joe",
				lastName: "Doe2",
				email: "joe.doe2@gmail.com",
				password: "pw"
			} )
		} ;
		
		var getQuery = {
			method: 'GET' ,
			path: '/Users/543bb877bd15489d0d7b0130' ,
			headers: {
				Host: 'localhost'
			}
		} ;
		
		async.series( [
			function( callback ) {
				requester( putQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 201 ) ;
					
					//console.log( "Response:" , response ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					expect( data.password ).to.be.an( 'object' ) ;
					expect( data.password.algo ).to.be.a( 'string' ) ;
					expect( data.password.salt ).to.be.a( 'string' ) ;
					expect( data.password.hash ).to.be.a( 'string' ) ;
					//console.log( data.password ) ;
					delete data.password ;
					
					expect( data ).to.be.eql( {
						_id: "543bb877bd15489d0d7b0130",
						firstName: "Joe",
						lastName: "Doe2",
						email: "joe.doe2@gmail.com",
						login: "joe.doe2@gmail.com",
						token: {},
						slugId: data.slugId,	// Cannot be predicted
						userAccess: {},
						groupAccess: {},
						otherAccess: restQuery.accessLevel.READ,
						inheritAccess: 'none',
						parent: {
							collection: null,
							id: '/'
						}
					} ) ;
					
					//console.log( "Response:" , response ) ;
					
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
		
	} ) ;
	
	it( "PUT, DELETE then GET on a user" , function( done ) {
		
		var putQuery = {
			method: 'PUT' ,
			path: '/Users/543bb877bd15489d0d7b0132' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				firstName: "John",
				lastName: "Doe",
				email: "john.doe@gmail.com",
				password: "pw",
				otherAccess: restQuery.accessLevel.ALL
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
		
		async.series( [
			function( callback ) {
				requester( putQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 201 ) ;
					
					//console.log( "Response:" , response ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( deleteQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					//console.log( "Response:" , response ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 404 ) ;
					expect( response.body ).not.to.be.ok() ;
					
					//console.log( "Response:" , response ) ;
					
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
		
	} ) ;
	
} ) ;
