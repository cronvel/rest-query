/*
	Rest Query
	
	Copyright (c) 2014 - 2016 Cédric Ronvel
	
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

var restQuery = require( '../lib/restQuery.js' ) ;

var http = require( 'http' ) ;
var childProcess = require( 'child_process' ) ;
var mongodb = require( 'mongodb' ) ;


var async = require( 'async-kit' ) ;
var tree = require( 'tree-kit' ) ;
var fsKit = require( 'fs-kit' ) ;

var appProto = 'http' ;
var appPort = 1234 ;
var appProcess ;
var dbUrl = 'mongodb://localhost:27017/restQuery' ;
var db ;




			/* Utils */



// it flatten prototype chain, so a single object owns every property of its parents
var protoflatten = tree.extend.bind( undefined , { deep: true , immutables: [ mongodb.ObjectID.prototype ] } , null ) ;



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
	collection.remove( function( error ) {
		if ( ! collection.attachmentUrl ) { callback( error ) ; return ; }
		
		fsKit.deltree( collection.attachmentUrl , callback ) ;
	} ) ;
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
	appProcess = childProcess.spawn( __dirname + '/../bin/restquery' , [
		//__dirname + '/../sample.json/main.json' ,
		__dirname + '/../sample.kfg/main.kfg' ,
		'--port' , appPort ,
		'--buildIndexes'
	] ) ;
	
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
	// it's way out of the scope of this test suite, so we just hope it is ready after few ms
	setTimeout( maybeCallback , 1000 ) ;
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
				description: "... about my wonderful life",
				publicAccess: { traverse: 1 , read: 4 , create: 1 }
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
					
					expect( data ).to.equal( {
						_id: "543bb877bd15489d0d7b0120",
						title: "My website!",
						description: "... about my wonderful life",
						slugId: data.slugId,	// Cannot be predicted
						parent: {
							collection: null,
							id: '/'
						},
					} ) ;
					
					//console.log( "Response:" , response ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				getQuery.path += "?tier=4" ;
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					expect( data ).to.equal( {
						_id: "543bb877bd15489d0d7b0120",
						title: "My website!",
						description: "... about my wonderful life",
						slugId: data.slugId,	// Cannot be predicted
						parent: {
							collection: null,
							id: '/'
						},
						userAccess: {},
						groupAccess: {},
						publicAccess: { traverse: 1, read: 4, create: 1 } ,
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
				description: "... about my wonderful life" ,
				publicAccess: { traverse: 1 , read: 4 , create: 1 }
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
					
					expect( data ).to.equal( {
						_id: postDocument.id,
						title: "My website!",
						description: "... about my wonderful life",
						slugId: data.slugId,	// Cannot be predicted
						parent: {
							collection: null,
							id: '/'
						}
					} ) ;
					
					//console.log( "Response:" , response ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				getQuery.path += "?tier=4" ;
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					expect( data ).to.equal( {
						_id: postDocument.id,
						title: "My website!",
						description: "... about my wonderful life",
						slugId: data.slugId,	// Cannot be predicted
						parent: {
							collection: null,
							id: '/'
						} ,
						userAccess: {},
						groupAccess: {},
						publicAccess: { traverse: 1, read: 4 , create: 1 }
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
				publicAccess: { traverse: 1, read: 5, write: 5, delete: 1, create: 1 }
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
					
					expect( data ).to.equal( {
						_id: "543bb877bd15489d0d7b0121",
						title: "My *NEW* website!",
						description: "... about my wonderful life",
						slugId: data.slugId,	// Cannot be predicted
						parent: {
							collection: null,
							id: '/'
						}
					} ) ;
					
					//console.log( "Response:" , response ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				getQuery.path += "?tier=4" ;
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					expect( data ).to.equal( {
						_id: "543bb877bd15489d0d7b0121",
						title: "My *NEW* website!",
						description: "... about my wonderful life",
						slugId: data.slugId,	// Cannot be predicted
						parent: {
							collection: null,
							id: '/'
						},
						userAccess: {},
						groupAccess: {},
						publicAccess: { traverse: 1, read: 5, write: 5, delete: 1, create: 1 },
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
				publicAccess: { traverse: 1, read: 5, write: 5, delete: 1, create: 1 }
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
	
	it( "Multiple PUT then GET on the whole blog collection" , function( done ) {
		
		var putQuery1 = {
			method: 'PUT' ,
			path: '/Blogs/543bb877bd15489d0d7b0121' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				title: "First post!",
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
				title: "About",
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
				title: "10 things about nothing",
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
		
		async.series( [
			function( callback ) {
				requester( putQuery1 , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 201 ) ;
					
					//console.log( "Response:" , response ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( putQuery2 , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 201 ) ;
					
					//console.log( "Response:" , response ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( putQuery3 , function( error , response ) {
					
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
					
					data = data.sort( ( a , b ) => a._id < b._id ? -1 : 1 ) ;
					
					expect( data ).to.equal( [ 
						{
							_id: "543bb877bd15489d0d7b0121",
							title: "First post!",
							description: "Everything started with that.",
							slugId: data[ 0 ].slugId,	// Cannot be predicted
							parent: {
								collection: null,
								id: '/'
							},
						} ,
						{
							_id: "543bb877bd15489d0d7b0122",
							title: "About",
							description: "About this blog.",
							slugId: data[ 1 ].slugId,	// Cannot be predicted
							parent: {
								collection: null,
								id: '/'
							},
						} ,
						{
							_id: "543bb877bd15489d0d7b0123",
							title: "10 things about nothing",
							description: "10 things you should know... or not...",
							slugId: data[ 2 ].slugId,	// Cannot be predicted
							parent: {
								collection: null,
								id: '/'
							},
						} ,
					] ) ;
					
					//console.log( "Response:" , response ) ;
					
					callback() ;
				} ) ;
			} ,
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
				password: "pw" ,
				publicAccess: { traverse: 1 , read: 5 , create: 1 }
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
					
					expect( data ).to.equal( {
						_id: "543bb877bd15489d0d7b0130",
						firstName: "Joe",
						lastName: "Doe2",
						email: "joe.doe2@gmail.com",
						login: "joe.doe2@gmail.com",
						groups: [],
						slugId: data.slugId,	// Cannot be predicted
						parent: {
							collection: null,
							id: '/'
						}
					} ) ;
					
					//console.log( "Response:" , response ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				getQuery.path += "?tier=5" ;
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
					
					expect( data ).to.equal( {
						_id: "543bb877bd15489d0d7b0130",
						firstName: "Joe",
						lastName: "Doe2",
						email: "joe.doe2@gmail.com",
						login: "joe.doe2@gmail.com",
						isApiKey: false,
						groups: [],
						token: {},
						slugId: data.slugId,	// Cannot be predicted
						userAccess: {},
						groupAccess: {},
						publicAccess: { traverse: 1, read: 5 , create: 1 } ,
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
				publicAccess: { traverse: 1, read: 5, write: 5, delete: 1, create: 1 }
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



describe( "Attachment" , function() {
	
	it( "Attachment tests..." ) ;
	
} ) ;



describe( "Links population" , function() {
	
	it( "GET on document and collection + populate links" , function( done ) {
		
		var u1 , u2 , u3 ;
		
		var postQuery1 = {
			method: 'POST' ,
			path: '/Users' ,
			headers: {
				Host: 'localhost' ,
				"Content-Type": 'application/json'
			} ,
			body: JSON.stringify( {
				firstName: "Big Joe",
				lastName: "Doe",
				email: "big.joe.doe@gmail.com",
				password: "pw",
				publicAccess: { traverse: 1 , read: 5 , create: 1 }
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
				firstName: "THE",
				lastName: "GODFATHER",
				email: "godfather@gmail.com",
				password: "pw",
				publicAccess: { traverse: 1 , read: 5 , create: 1 }
			} )
		} ;
		
		var postQuery3 , getQuery ;
		
		
		async.series( [
			function( callback ) {
				requester( postQuery1 , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 201 ) ;
					u1 = JSON.parse( response.body ).id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				requester( postQuery2 , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 201 ) ;
					u2 = JSON.parse( response.body ).id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				
				postQuery3 = {
					method: 'POST' ,
					path: '/Users' ,
					headers: {
						Host: 'localhost' ,
						"Content-Type": 'application/json'
					} ,
					body: JSON.stringify( {
						firstName: "Joe",
						lastName: "Doe",
						email: "joe.doe@gmail.com",
						password: "pw",
						father: u1,
						godfather: u2,
						publicAccess: { traverse: 1 , read: 5 , create: 1 }
					} )
				} ;
				
				requester( postQuery3 , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 201 ) ;
					u3 = JSON.parse( response.body ).id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				getQuery = {
					method: 'GET' ,
					path: '/Users/' + u3 + '?populate=[father,godfather]' ,
					headers: {
						Host: 'localhost'
					}
				} ;
				
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					delete data.father.password ;
					delete data.godfather.password ;
					
					expect( data ).to.equal( {
						_id: data._id,
						firstName: "Joe",
						lastName: "Doe",
						email: "joe.doe@gmail.com",
						login: "joe.doe@gmail.com",
						slugId: data.slugId,	// Cannot be predicted
						groups: [],
						parent: {
							collection: null,
							id: '/'
						},
						father: {
							_id: data.father._id,
							firstName: "Big Joe",
							lastName: "Doe",
							email: "big.joe.doe@gmail.com",
							login: "big.joe.doe@gmail.com",
							slugId: data.father.slugId,
							groups: [],
							parent: {
								collection: null,
								id: "/"
							},
						},
						godfather: {
							_id: data.godfather._id,
							firstName: "THE",
							lastName: "GODFATHER",
							email: "godfather@gmail.com",
							login: "godfather@gmail.com",
							slugId: data.godfather.slugId,
							groups: [],
							parent: {
								collection: null,
								id: "/"
							},
						}
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				getQuery = {
					method: 'GET' ,
					path: '/Users/' + u3 + '?populate=[father,godfather]&tier=5&pTier=5' ,
					headers: {
						Host: 'localhost'
					}
				} ;
				
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					expect( data.password ).to.be.an( 'object' ) ;
					expect( data.password.algo ).to.be.a( 'string' ) ;
					expect( data.password.salt ).to.be.a( 'string' ) ;
					expect( data.password.hash ).to.be.a( 'string' ) ;
					delete data.password ;
					delete data.father.password ;
					delete data.godfather.password ;
					
					expect( data ).to.equal( {
						_id: data._id,
						firstName: "Joe",
						lastName: "Doe",
						email: "joe.doe@gmail.com",
						login: "joe.doe@gmail.com",
						slugId: data.slugId,	// Cannot be predicted
						groups: [],
						parent: {
							collection: null,
							id: '/'
						},
						isApiKey: false,
						token: {},
						publicAccess: {
							create: 1,
							read: 5,
							traverse: 1
						},
						userAccess: {},
						groupAccess: {},
						father: {
							_id: data.father._id,
							firstName: "Big Joe",
							lastName: "Doe",
							email: "big.joe.doe@gmail.com",
							login: "big.joe.doe@gmail.com",
							isApiKey: false,
							slugId: data.father.slugId,
							groups: [],
							token: {},
							userAccess: {},
							groupAccess: {},
							publicAccess: { traverse: 1, read: 5, create: 1 },
							parent: {
								collection: null,
								id: "/"
							},
						},
						godfather: {
							_id: data.godfather._id,
							firstName: "THE",
							lastName: "GODFATHER",
							email: "godfather@gmail.com",
							login: "godfather@gmail.com",
							isApiKey: false,
							slugId: data.godfather.slugId,
							groups: [],
							token: {},
							userAccess: {},
							groupAccess: {},
							publicAccess: { traverse: 1, read: 5, create: 1 },
							parent: {
								collection: null,
								id: "/"
							},
						}
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				getQuery = {
					method: 'GET' ,
					path: '/Users/' + u3 + '?populate=[father,godfather]&tier=5&pTier=1' ,
					headers: {
						Host: 'localhost'
					}
				} ;
				
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					expect( data.password ).to.be.an( 'object' ) ;
					expect( data.password.algo ).to.be.a( 'string' ) ;
					expect( data.password.salt ).to.be.a( 'string' ) ;
					expect( data.password.hash ).to.be.a( 'string' ) ;
					delete data.password ;
					delete data.father.password ;
					delete data.godfather.password ;
					
					expect( data ).to.equal( {
						_id: data._id,
						firstName: "Joe",
						lastName: "Doe",
						email: "joe.doe@gmail.com",
						login: "joe.doe@gmail.com",
						slugId: data.slugId,	// Cannot be predicted
						groups: [],
						parent: {
							collection: null,
							id: '/'
						},
						isApiKey: false,
						token: {},
						publicAccess: {
							create: 1,
							read: 5,
							traverse: 1
						},
						userAccess: {},
						groupAccess: {},
						father: {
							_id: data.father._id,
							login: "big.joe.doe@gmail.com",
							parent: {
								collection: null,
								id: "/"
							},
						},
						godfather: {
							_id: data.godfather._id,
							login: "godfather@gmail.com",
							parent: {
								collection: null,
								id: "/"
							},
						}
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				getQuery = {
					method: 'GET' ,
					path: '/Users?populate=[father,godfather]' ,
					headers: {
						Host: 'localhost'
					}
				} ;
				
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					data.sort( function( a , b ) {
						return a.firstName.charCodeAt( 0 ) - b.firstName.charCodeAt( 0 ) ;
					} ) ;
					
					expect( data ).to.equal( [
						{
							_id: data[ 0 ]._id,
							firstName: "Big Joe",
							lastName: "Doe",
							email: "big.joe.doe@gmail.com",
							login: "big.joe.doe@gmail.com",
							slugId: data[ 0 ].slugId,
							groups: [],
							//father: null, godfather: null,
							parent: {
								collection: null,
								id: "/"
							},
						},
						{
							_id: data[ 1 ]._id,
							firstName: "Joe",
							lastName: "Doe",
							email: "joe.doe@gmail.com",
							login: "joe.doe@gmail.com",
							slugId: data[ 1 ].slugId,	// Cannot be predicted
							groups: [],
							parent: {
								collection: null,
								id: '/'
							},
							father: {
								_id: data[ 0 ]._id,
								firstName: "Big Joe",
								lastName: "Doe",
								email: "big.joe.doe@gmail.com",
								login: "big.joe.doe@gmail.com",
								slugId: data[ 0 ].slugId,
								groups: [],
								parent: {
									collection: null,
									id: "/"
								},
							},
							godfather: {
								_id: data[ 2 ]._id,
								firstName: "THE",
								lastName: "GODFATHER",
								email: "godfather@gmail.com",
								login: "godfather@gmail.com",
								slugId: data[ 2 ].slugId,
								groups: [],
								parent: {
									collection: null,
									id: "/"
								},
							}
						},
						{
							_id: data[ 2 ]._id,
							firstName: "THE",
							lastName: "GODFATHER",
							email: "godfather@gmail.com",
							login: "godfather@gmail.com",
							slugId: data[ 2 ].slugId,
							groups: [],
							//father: null, godfather: null,
							parent: {
								collection: null,
								id: "/"
							},
						}
					] ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				getQuery = {
					method: 'GET' ,
					path: '/Users?populate=[father,godfather]&tier=5&pTier=5' ,
					headers: {
						Host: 'localhost'
					}
				} ;
				
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					data.sort( function( a , b ) {
						return a.firstName.charCodeAt( 0 ) - b.firstName.charCodeAt( 0 ) ;
					} ) ;
					
					delete data[ 0 ].password ;
					delete data[ 1 ].password ;
					delete data[ 1 ].father.password ;
					delete data[ 1 ].godfather.password ;
					delete data[ 2 ].password ;
					
					expect( data ).to.equal( [
						{
							_id: data[ 0 ]._id,
							firstName: "Big Joe",
							lastName: "Doe",
							email: "big.joe.doe@gmail.com",
							login: "big.joe.doe@gmail.com",
							isApiKey: false,
							slugId: data[ 0 ].slugId,
							groups: [],
							//father: null, godfather: null,
							token: {},
							userAccess: {},
							groupAccess: {},
							publicAccess: { traverse: 1, read: 5, create: 1 },
							parent: {
								collection: null,
								id: "/"
							},
						},
						{
							_id: data[ 1 ]._id,
							firstName: "Joe",
							lastName: "Doe",
							email: "joe.doe@gmail.com",
							login: "joe.doe@gmail.com",
							isApiKey: false,
							slugId: data[ 1 ].slugId,	// Cannot be predicted
							groups: [],
							token: {},
							userAccess: {},
							groupAccess: {},
							publicAccess: { traverse: 1, read: 5, create: 1 },
							parent: {
								collection: null,
								id: '/'
							},
							father: {
								_id: data[ 0 ]._id,
								firstName: "Big Joe",
								lastName: "Doe",
								email: "big.joe.doe@gmail.com",
								login: "big.joe.doe@gmail.com",
								isApiKey: false,
								slugId: data[ 0 ].slugId,
								groups: [],
								token: {},
								userAccess: {},
								groupAccess: {},
								publicAccess: { traverse: 1, read: 5, create: 1 },
								parent: {
									collection: null,
									id: "/"
								},
							},
							godfather: {
								_id: data[ 2 ]._id,
								firstName: "THE",
								lastName: "GODFATHER",
								email: "godfather@gmail.com",
								login: "godfather@gmail.com",
								isApiKey: false,
								slugId: data[ 2 ].slugId,
								groups: [],
								token: {},
								userAccess: {},
								groupAccess: {},
								publicAccess: { traverse: 1, read: 5, create: 1 },
								parent: {
									collection: null,
									id: "/"
								},
							}
						},
						{
							_id: data[ 2 ]._id,
							firstName: "THE",
							lastName: "GODFATHER",
							email: "godfather@gmail.com",
							login: "godfather@gmail.com",
							isApiKey: false,
							slugId: data[ 2 ].slugId,
							groups: [],
							//father: null, godfather: null,
							token: {},
							userAccess: {},
							groupAccess: {},
							publicAccess: { traverse: 1, read: 5, create: 1 },
							parent: {
								collection: null,
								id: "/"
							},
						}
					] ) ;
					
					callback() ;
				} ) ;
			},
			function( callback ) {
				getQuery = {
					method: 'GET' ,
					path: '/Users?populate=[father,godfather]&tier=5&pTier=1' ,
					headers: {
						Host: 'localhost'
					}
				} ;
				
				requester( getQuery , function( error , response ) {
					
					expect( error ).not.to.be.ok() ;
					expect( response.status ).to.be( 200 ) ;
					
					expect( response.body ).to.be.ok() ;
					
					var data = JSON.parse( response.body ) ;
					
					data.sort( function( a , b ) {
						return a.firstName.charCodeAt( 0 ) - b.firstName.charCodeAt( 0 ) ;
					} ) ;
					
					delete data[ 0 ].password ;
					delete data[ 1 ].password ;
					delete data[ 2 ].password ;
					
					expect( data ).to.equal( [
						{
							_id: data[ 0 ]._id,
							firstName: "Big Joe",
							lastName: "Doe",
							email: "big.joe.doe@gmail.com",
							login: "big.joe.doe@gmail.com",
							isApiKey: false,
							slugId: data[ 0 ].slugId,
							groups: [],
							//father: null, godfather: null,
							token: {},
							userAccess: {},
							groupAccess: {},
							publicAccess: { traverse: 1, read: 5, create: 1 },
							parent: {
								collection: null,
								id: "/"
							},
						},
						{
							_id: data[ 1 ]._id,
							firstName: "Joe",
							lastName: "Doe",
							email: "joe.doe@gmail.com",
							login: "joe.doe@gmail.com",
							isApiKey: false,
							slugId: data[ 1 ].slugId,	// Cannot be predicted
							groups: [],
							token: {},
							userAccess: {},
							groupAccess: {},
							publicAccess: { traverse: 1, read: 5, create: 1 },
							parent: {
								collection: null,
								id: '/'
							},
							father: {
								_id: data[ 0 ]._id,
								login: "big.joe.doe@gmail.com",
								parent: {
									collection: null,
									id: "/"
								},
							},
							godfather: {
								_id: data[ 2 ]._id,
								login: "godfather@gmail.com",
								parent: {
									collection: null,
									id: "/"
								},
							}
						},
						{
							_id: data[ 2 ]._id,
							firstName: "THE",
							lastName: "GODFATHER",
							email: "godfather@gmail.com",
							login: "godfather@gmail.com",
							isApiKey: false,
							slugId: data[ 2 ].slugId,
							groups: [],
							//father: null, godfather: null,
							token: {},
							userAccess: {},
							groupAccess: {},
							publicAccess: { traverse: 1, read: 5, create: 1 },
							parent: {
								collection: null,
								id: "/"
							},
						}
					] ) ;
					
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
		
	} ) ;
} ) ;
	
