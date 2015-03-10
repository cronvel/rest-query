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
/* global describe, it, before, after, beforeEach */



var restQuery = require( '../lib/restQuery.js' ) ;

var net = require( 'net' ) ;
var stream = require( 'stream' ) ;
var childProcess = require( 'child_process' ) ;

var async = require( 'async-kit' ) ;
var tree = require( 'tree-kit' ) ;
var string = require( 'string-kit' ) ;
var odm = require( 'odm-kit' ) ;

var buffertools = require( 'buffertools' ) ;
var mongodb = require( 'mongodb' ) ;

var expect = require( 'expect.js' ) ;





// Collections...
var blogs , posts , comments ;

var blogsDescriptor = {
	url: 'mongodb://localhost:27017/restQuery/blogs' ,
	properties: {
		description: { constraint: 'string' }
	} ,
	meta: {
	} ,
	indexes: [
	] ,
	hooks: {
	} ,
	useMemProxy: true
} ;

var postsDescriptor = {
	url: 'mongodb://localhost:27017/restQuery/posts' ,
	properties: {
		content: { constraint: 'string' }
	} ,
	meta: {
	} ,
	indexes: [
	] ,
	hooks: {
	} ,
	useMemProxy: true
} ;

var commentsDescriptor = {
	url: 'mongodb://localhost:27017/restQuery/comments' ,
	properties: {
		content: { constraint: 'string' }
	} ,
	meta: {
	} ,
	indexes: [
	] ,
	hooks: {
	} ,
	useMemProxy: true
} ;






			/* Utils */



// it flatten prototype chain, so a single object owns every property of its parents
var protoflatten = tree.extend.bind( undefined , { deep: true , deepFilter: { blacklist: [ mongodb.ObjectID.prototype ] } } , null ) ;



function clearCollection( collection , callback )
{
	collection.driver.rawInit( function( error ) {
		if ( error ) { callback( error ) ; return ; }
		collection.driver.raw.remove( callback ) ;
	} ) ;
}



function commonApp( callback )
{
	var app = restQuery.createApp() ;
	var performer = app.createPerformer() ;
	
	var blogsNode = app.createCollectionNode( 'blogs' , blogsDescriptor ) ;
	var postsNode = app.createCollectionNode( 'posts' , postsDescriptor ) ;
	var commentsNode = app.createCollectionNode( 'comments' , commentsDescriptor ) ;
	
	app.root.contains( blogsNode ) ;
	blogsNode.contains( postsNode ) ;
	postsNode.contains( commentsNode ) ;
	
	async.parallel( [
		[ clearCollection , blogsNode.collection ] ,
		[ clearCollection , postsNode.collection ] ,
		[ clearCollection , commentsNode.collection ]
	] )
	.exec( function( error ) {
		expect( error ).not.to.be.ok() ;
		if ( error ) { callback( error ) ; return ; }
		callback( undefined , app , performer ) ;
	} ) ;
}



			/* Tests */



// Force creating the collection
/*
before( function( done ) {
	
	blogs = world.createCollection( 'blogs' , blogsDescriptor ) ;
	expect( blogs ).to.be.a( odm.Collection ) ;
	
	posts = world.createCollection( 'posts' , postsDescriptor ) ;
	expect( posts ).to.be.a( odm.Collection ) ;
	
	comments = world.createCollection( 'comments' , commentsDescriptor ) ;
	expect( comments ).to.be.a( odm.Collection ) ;
	
	done() ;
} ) ;
*/



describe( "restQuery" , function() {
	
	/*
	it( "" , function( done ) {
		
		var root = restQuery.Root() ;
		
		root.attach( 'blogs' , blogsDescriptor ) ;
		root.attach( 'posts' , postsDescriptor ) ;
		root.attach( 'comments' , commentsDescriptor ) ;
		
		expect( root.children ).to.only.have.keys( 'Blogs' , 'Posts' , 'Comments' ) ;
		
		done() ;
	} ) ;
	*/
	
	it( "GET on an unexisting item" , function( done ) {
		
		commonApp( function( error , app , performer ) {
			
			app.root.get( performer , '/Blogs/111111111111111111111111' , function( error , object ) {
				
				expect( error ).to.be.ok() ;
				expect( error.type ).to.be( 'notFound' ) ;
				expect( error.httpStatus ).to.be( 404 ) ;
				console.log( error ) ;
				console.log( object ) ;
				done() ;
			} ) ;
		} ) ;
	} ) ;
	
	it( "GET on an existing item" , function( done ) {
		
		var app , performer , blog , id ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					blog = app.root.children.blogs.collection.createDocument( {
						title: 'My wonderful life' ,
						description: 'This is a supa blog!'
					} ) ;
					id = blog.$._id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				blog.save( callback ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( performer , '/Blogs/' + id , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					console.log( 'result of get:' ) ;
					//console.log( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					console.log( object ) ;
					console.log( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( 'My wonderful life' ) ;
					expect( object.description ).to.be( 'This is a supa blog!' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT then GET" , function( done ) {
		
		var app , performer , blog , id ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( performer , '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)'
				} , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					console.log( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( performer , '/Blogs/5437f846c41d0e910ec9a5d8' , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					console.log( 'result of get:' ) ;
					//console.log( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					console.log( object ) ;
					console.log( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( 'My wonderful life 2!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! (x2)' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT, then DELETE, then GET" , function( done ) {
		
		var app , performer , blog , id ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( performer , '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)'
				} , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					console.log( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.delete( performer , '/Blogs/5437f846c41d0e910ec9a5d8' , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					console.log( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( performer , '/Blogs/5437f846c41d0e910ec9a5d8' , function( error , object ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
					console.log( error ) ;
					console.log( object ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
} ) ;


