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



var cli = getCliOptions() ;

var smartPreprocessor = require( 'smart-preprocessor' ) ;
var restQuery = cli['log-lib'] ?
	smartPreprocessor.require( __dirname + '/../lib/restQuery.js' , { debug: true } ) :
	require( '../lib/restQuery.js' ) ;

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
		//title: { constraint: 'string' } , // already defined by restQuery
		description: { constraint: 'string' },
		embedded: { constraint: 'object' }	// just for the test
	} ,
	meta: {
	} ,
	indexes: [
	] ,
	hooks: {
	} ,
	useMemProxy: false
} ;

var postsDescriptor = {
	url: 'mongodb://localhost:27017/restQuery/posts' ,
	properties: {
		//title: { constraint: 'string' } ,	// already defined by restQuery
		content: { constraint: 'string' }
	} ,
	meta: {
	} ,
	indexes: [
	] ,
	hooks: {
	} ,
	useMemProxy: false
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
	useMemProxy: false
} ;






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



describe( "Basic queries of object of a top-level collection" , function() {
	
	it( "GET on an unexisting item" , function( done ) {
		
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
				app.root.get( '/Blogs/111111111111111111111111' , { performer: performer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
					debug( error ) ;
					debug( object ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "GET on a regular item" , function( done ) {
		
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
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'My wonderful life' ,
					description: 'This is a supa blog!'
				} ) ;
				id = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( '/Blogs/' + id , { performer: performer } , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
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
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)'
				} , { performer: performer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( 'My wonderful life 2!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! (x2)' ) ;
					expect( object.parent ).to.eql( {} ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "Test of the test: test helper commonApp() should clean previously created items" , function( done ) {
		
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
				// Same ID than in previous test
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
					debug( error ) ;
					debug( object ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT, then PUT (overwrite), then GET" , function( done ) {
		
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
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 3!!!' ,
					description: 'This is a supa blog! (x3)'
				} , { performer: performer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 3!!!' ,
					description: 'This is a supa blog! Now overwritten!'
				} , { performer: performer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( 'My wonderful life 3!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! Now overwritten!' ) ;
					expect( object.parent ).to.eql( {} ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PATCH on an unexisting item" , function( done ) {
		
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
				app.root.patch( '/Blogs/111111111111111111111111' , {
					description: 'Oh yeah!'
				} , { performer: performer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
					debug( error ) ;
					debug( object ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT, then PATCH, then GET (featuring embedded data)" , function( done ) {
		
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
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 3!!!' ,
					description: 'This is a supa blog! (x3)' ,
					embedded: { a: 'a' , b: 'b' }
				} , { performer: performer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					description: 'This is a supa blog! Now patched!',
					"embedded.a": 'A',
					parent: "should not overwrite"
				} , { performer: performer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( 'My wonderful life 3!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! Now patched!' ) ;
					expect( object.embedded ).to.eql( { a: 'A' , b: 'b' } ) ;
					expect( object.parent ).to.eql( {} ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "DELETE on an unexisting item" , function( done ) {
		
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
				app.root.delete( '/Blogs/111111111111111111111111' , { performer: performer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
					debug( error ) ;
					debug( object ) ;
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
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)'
				} , { performer: performer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.delete( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
					debug( error ) ;
					debug( object ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
} ) ;



describe( "Basic queries of top-level collections" , function() {
	
	it( "GET on an empty collection" , function( done ) {
		
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
				
				app.root.get( '/Blogs' , { performer: performer } , function( error , batch ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					debug( batch ) ;
					debug( JSON.stringify( batch ) ) ;
					
					expect( batch ).to.be.eql( [] ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "GET on a collection with items" , function( done ) {
		
		var app , performer , blog , id1 , id2 ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'My wonderful life' ,
					description: 'This is a supa blog!'
				} ) ;
				id1 = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'YAB' ,
					description: 'Yet Another Blog'
				} ) ;
				id2 = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs' , { performer: performer } , function( error , batch ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					debug( batch ) ;
					debug( JSON.stringify( batch ) ) ;
					
					expect( batch ).to.be.eql( [
						{
							title: 'My wonderful life',
							description: 'This is a supa blog!',
							_id: id1,
							embedded: undefined,
							parent: undefined,
							SID: undefined
						} ,
						{
							title: 'YAB' ,
							description: 'Yet Another Blog' ,
							_id: id2,
							embedded: undefined,
							parent: undefined,
							SID: undefined
						}
					] ) ;
					
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
} ) ;



describe( "Queries of nested object" , function() {
	
	it( "GET on an unexisting nested item" , function( done ) {
		
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
				app.root.get(
					'/Blogs/111111111111111111111111/Posts/111111111111111111111111' ,
					{ performer: performer } ,
					function( error , object ) {
						
						expect( error ).to.be.ok() ;
						expect( error.type ).to.be( 'notFound' ) ;
						expect( error.httpStatus ).to.be( 404 ) ;
						debug( error ) ;
						debug( object ) ;
						callback() ;
					}
				) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "GET on a regular nested item" , function( done ) {
		
		var app , performer , blog , post , blogId , postId ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'My wonderful life' ,
					description: 'This is a supa blog!'
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { blogs: blogId }
				} ) ;
				postId = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( 'My first post!' ) ;
					expect( object.content ).to.be( 'Blah blah blah.' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "GET on an existed nested item with bad ancestry chain" , function( done ) {
		
		var app , performer , blog , anotherBlog , post , blogId , anotherBlogId , postId ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'My wonderful life' ,
					description: 'This is a supa blog!'
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				anotherBlog = app.root.children.blogs.collection.createDocument( {
					title: 'Another blog' ,
					description: 'Oh yeah'
				} ) ;
				anotherBlogId = anotherBlog.$._id ;
				anotherBlog.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My second post!' ,
					content: 'Blah blah blah.' ,
					parent: { blogs: blogId }
				} ) ;
				postId = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( 'My second post!' ) ;
					expect( object.content ).to.be( 'Blah blah blah.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + anotherBlogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
					expect( error.message ).to.be( 'Ancestry mismatch.' ) ;
					expect( object ).to.be( undefined ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "GET on a regular nested² item" , function( done ) {
		
		var app , performer , blog , post , comment , blogId , postId , commentId ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'My wonderful life' ,
					description: 'This is a supa blog!'
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { blogs: blogId }
				} ) ;
				postId = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				comment = app.root.children.blogs.children.posts.children.comments.collection.createDocument( {
					content: 'First!' ,
					parent: { posts: postId }
				} ) ;
				commentId = comment.$._id ;
				//console.log( "commentId: " , commentId ) ;
				comment.save( callback ) ;
			} ,
			/*
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				comment = app.root.children.blogs.children.posts.children.comments.collection.get( commentId , function( error , doc ) {
					//console.log( string.inspect( { style: 'color' , proto: true } , doc.$ ) ) ;
					callback() ;
				} ) ;
			} ,
			//*/
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId + '/Comments/' + commentId , { performer: performer } , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( undefined ) ;
					expect( object.content ).to.be( 'First!' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "GET on a regular nested² item with bad ancestry chain" , function( done ) {
		
		var app , performer ,
			blog , anotherBlog , post , anotherPost , comment ,
			blogId , anotherBlogId , postId , anotherPostId , commentId ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'My wonderful life' ,
					description: 'This is a supa blog!'
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				anotherBlog = app.root.children.blogs.collection.createDocument( {
					title: 'Another blog' ,
					description: 'Oh yeah'
				} ) ;
				anotherBlogId = anotherBlog.$._id ;
				anotherBlog.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { blogs: blogId }
				} ) ;
				postId = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				anotherPost = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My second post!' ,
					content: 'Blih blih blih.' ,
					parent: { blogs: blogId }
				} ) ;
				anotherPostId = anotherPost.$._id ;
				//console.log( "postId: " , postId ) ;
				anotherPost.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				comment = app.root.children.blogs.children.posts.children.comments.collection.createDocument( {
					content: 'First!' ,
					parent: { posts: postId }
				} ) ;
				commentId = comment.$._id ;
				//console.log( "commentId: " , commentId ) ;
				comment.save( callback ) ;
			} ,
			/*
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				comment = app.root.children.blogs.children.posts.children.comments.collection.get( commentId , function( error , doc ) {
					//console.log( string.inspect( { style: 'color' , proto: true } , doc.$ ) ) ;
					callback() ;
				} ) ;
			} ,
			//*/
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId + '/Comments/' + commentId , { performer: performer } , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( undefined ) ;
					expect( object.content ).to.be( 'First!' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + anotherBlogId + '/Posts/' + postId + '/Comments/' + commentId , { performer: performer } , function( error , object ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
					expect( error.message ).to.be( 'Ancestry mismatch.' ) ;
					expect( object ).to.be( undefined ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + anotherPostId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'My second post!' ) ;
					expect( object.content ).to.be( 'Blih blih blih.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + anotherPostId + '/Comments/' + commentId , { performer: performer } , function( error , object ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
					expect( error.message ).to.be( 'Ancestry mismatch.' ) ;
					expect( object ).to.be( undefined ) ;
					callback() ;
				} ) ;
			} ,
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT on nested object should set the parent property correctly, same for PUT in overwrite mode" , function( done ) {
		
		var app , performer , blog , post , blogId , postId = '5437f8f6c41d00910ec9a5d8' ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'My wonderful life' ,
					description: 'This is a supa blog!'
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			/*
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { blogs: blogId }
				} ) ;
				postId = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			*/
			function( callback ) {
				app.root.put(
					'/Blogs/' + blogId + '/Posts/' + postId ,
					{ title: 'My first post!!!' , content: 'Blah blah blah...' , parent: { blogs: 'should not overwrite' } } ,
					{ performer: performer } ,
					function( error , object ) {
						if ( error ) { callback( error ) ; return ; }
						callback() ;
					}
				) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( 'My first post!!!' ) ;
					expect( object.content ).to.be( 'Blah blah blah...' ) ;
					expect( object.parent.blogs.toString() ).to.be( blogId.toString() ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put(
					'/Blogs/' + blogId + '/Posts/' + postId ,
					{ title: 'My first post???' , content: 'Blah?' , parent: { blogs: 'should not overwrite' } } ,
					{ performer: performer } ,
					function( error , object ) {
						if ( error ) { callback( error ) ; return ; }
						callback() ;
					}
				) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( 'My first post???' ) ;
					expect( object.content ).to.be( 'Blah?' ) ;
					expect( object.parent.blogs.toString() ).to.be( blogId.toString() ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	
	
	
	
	
	
	
	
	
	
	
	
	it( "PUT on an existed nested item with bad ancestry chain" , function( done ) {
		
		expect().fail() ;
		var app , performer , blog , anotherBlog , post , blogId , anotherBlogId , postId ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'My wonderful life' ,
					description: 'This is a supa blog!'
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				anotherBlog = app.root.children.blogs.collection.createDocument( {
					title: 'Another blog' ,
					description: 'Oh yeah'
				} ) ;
				anotherBlogId = anotherBlog.$._id ;
				anotherBlog.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My second post!' ,
					content: 'Blah blah blah.' ,
					parent: { blogs: blogId }
				} ) ;
				postId = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			function( callback ) {
				app.root.put(
					'/Blogs/' + blogId + '/Posts/' + postId ,
					{ title: 'My edited post!' , content: 'Plop.' } ,
					{ performer: performer } ,
					function( error , object ) {
						if ( error ) { callback( error ) ; return ; }
						callback() ;
					}
				) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + anotherBlogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
					expect( error.message ).to.be( 'Ancestry mismatch.' ) ;
					expect( object ).to.be( undefined ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
} ) ;



describe( "Misc" , function() {
	
	it( "Test CORS" ) ;
} ) ;
		



