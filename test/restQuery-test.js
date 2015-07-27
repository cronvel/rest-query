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

var async = require( 'async-kit' ) ;
var tree = require( 'tree-kit' ) ;
var string = require( 'string-kit' ) ;
var odm = require( 'odm-kit' ) ;

var buffertools = require( 'buffertools' ) ;
var mongodb = require( 'mongodb' ) ;

var expect = require( 'expect.js' ) ;
var doormen = require( 'doormen' ) ;

var config = require( './sample/app-config.js' ) ;





// Collections...
var blogs , posts , comments ;





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
	
	var blogsNode = app.createCollectionNode( 'blogs' , config.descriptors.blogs ) ;
	var postsNode = app.createCollectionNode( 'posts' , config.descriptors.posts ) ;
	var commentsNode = app.createCollectionNode( 'comments' , config.descriptors.comments ) ;
	var usersNode = app.createUsersCollectionNode( config.descriptors.users ) ;
	var groupsNode = app.createGroupsCollectionNode( config.descriptors.groups ) ;
	
	app.root.contains( usersNode ) ;
	app.root.contains( groupsNode ) ;
	app.root.contains( blogsNode ) ;
	blogsNode.contains( postsNode ) ;
	postsNode.contains( commentsNode ) ;
	
	async.parallel( [
		[ clearCollection , usersNode.collection ] ,
		[ clearCollection , groupsNode.collection ] ,
		[ clearCollection , blogsNode.collection ] ,
		[ clearCollection , postsNode.collection ] ,
		[ clearCollection , commentsNode.collection ]
	] )
	.exec( function( error ) {
		expect( error ).not.to.be.ok() ;
		if ( error ) { callback( error ) ; return ; }
		
		app.buildIndexes( function( error ) {
			if ( error ) { callback( error ) ; return ; }
			callback( undefined , app , performer ) ;
		} ) ;
	} ) ;
}



			/* Tests */



// Force creating the collection
/*
before( function( done ) {
	
	blogs = world.createCollection( 'blogs' , config.descriptors.blogs ) ;
	expect( blogs ).to.be.a( odm.Collection ) ;
	
	posts = world.createCollection( 'posts' , config.descriptors.posts ) ;
	expect( posts ).to.be.a( odm.Collection ) ;
	
	comments = world.createCollection( 'comments' , config.descriptors.comments ) ;
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
					description: 'This is a supa blog!' ,
					otherAccess: restQuery.accessLevel.ALL
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
	
	it( "POST then GET" , function( done ) {
		
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
				//try {
				app.root.post( '/Blogs' , {
					title: 'My wonderful life posted!!!' ,
					description: 'This is a supa blog! (posted!)' ,
					otherAccess: restQuery.accessLevel.ALL
				} , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					id = rawDocument.id ;
					//console.log( 'ID:' , id ) ;
					callback() ;
				} ) ;
				//} catch ( error ) { console.log( '##############' ) ; }
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
					expect( object.title ).to.be( 'My wonderful life posted!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! (posted!)' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
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
					description: 'This is a supa blog! (x2)' ,
					otherAccess: restQuery.accessLevel.ALL
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
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
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
					description: 'This is a supa blog! (x3)' ,
					otherAccess: restQuery.accessLevel.ALL
				} , { performer: performer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 3!!!' ,
					description: 'This is a supa blog! Now overwritten!' ,
					otherAccess: restQuery.accessLevel.ALL
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
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
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
					embedded: { a: 'a' , b: 'b' } ,
					otherAccess: restQuery.accessLevel.ALL
				} , { performer: performer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					description: 'This is a supa blog! Now patched!' ,
					"embedded.a": 'A' ,
					parent: "should not overwrite" ,
					otherAccess: restQuery.accessLevel.ALL
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
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
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
					description: 'This is a supa blog! (x2)' ,
					otherAccess: restQuery.accessLevel.ALL
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
					description: 'This is a supa blog!' ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				id1 = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'YAB' ,
					description: 'Yet Another Blog' ,
					otherAccess: restQuery.accessLevel.ALL
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
							parent: { id: '/', collection: null },
							userAccess: {},
							groupAccess: {},
							otherAccess: restQuery.accessLevel.ALL,
							inheritAccess: 'none',
							slugId: batch[ 0 ].slugId		// cannot be predicted
						} ,
						{
							title: 'YAB' ,
							description: 'Yet Another Blog' ,
							_id: id2,
							embedded: undefined,
							parent: { id: '/', collection: null },
							userAccess: {},
							groupAccess: {},
							otherAccess: restQuery.accessLevel.ALL,
							inheritAccess: 'none',
							slugId: batch[ 1 ].slugId		// cannot be predicted
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
					description: 'This is a supa blog!' ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: restQuery.accessLevel.ALL
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
					description: 'This is a supa blog!' ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				anotherBlog = app.root.children.blogs.collection.createDocument( {
					title: 'Another blog' ,
					description: 'Oh yeah' ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				anotherBlogId = anotherBlog.$._id ;
				anotherBlog.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My second post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs' , id: blogId } ,
					otherAccess: restQuery.accessLevel.ALL
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
					description: 'This is a supa blog!' ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				postId = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				comment = app.root.children.blogs.children.posts.children.comments.collection.createDocument( {
					title: 'nope!' ,
					content: 'First!' ,
					parent: { collection: 'posts', id: postId } ,
					otherAccess: restQuery.accessLevel.ALL
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
					expect( object.title ).to.be( 'nope!' ) ;
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
					description: 'This is a supa blog!' ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				anotherBlog = app.root.children.blogs.collection.createDocument( {
					title: 'Another blog' ,
					description: 'Oh yeah' ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				anotherBlogId = anotherBlog.$._id ;
				anotherBlog.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: restQuery.accessLevel.ALL
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
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				anotherPostId = anotherPost.$._id ;
				//console.log( "postId: " , postId ) ;
				anotherPost.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				comment = app.root.children.blogs.children.posts.children.comments.collection.createDocument( {
					title: 'nope!' ,
					content: 'First!' ,
					parent: { collection: 'posts', id: postId } ,
					otherAccess: restQuery.accessLevel.ALL
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
					expect( object.title ).to.be( 'nope!' ) ;
					expect( object.content ).to.be( 'First!' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + anotherBlogId + '/Posts/' + postId + '/Comments/' + commentId , { performer: performer } , function( error , object ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
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
					expect( object ).to.be( undefined ) ;
					callback() ;
				} ) ;
			} ,
		] )
		.exec( done ) ;
	} ) ;
	
	it( "GET a nested collection" , function( done ) {
		
		var app , performer , blog , anotherBlog , post , blogId , anotherBlogId , postId1 , postId2 , postId3 , postIdAlt ;
		
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
					description: 'This is a supa blog!' ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				anotherBlog = app.root.children.blogs.collection.createDocument( {
					title: 'Another blog' ,
					description: 'Oh yeah' ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				anotherBlogId = anotherBlog.$._id ;
				anotherBlog.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				postId1 = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My second post!' ,
					content: 'Hi ho!' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				postId2 = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My alternate post!' ,
					content: 'It does not belong to the same blog!' ,
					parent: { collection: 'blogs', id: anotherBlogId } ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				postIdAlt = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My third post!' ,
					content: 'Yay!' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				postId3 = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts' , { performer: performer } , function( error , batch ) {
					
					var i ;
					
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( batch ) ;
					debug( JSON.stringify( batch ) ) ;
					
					// MongoID and expect() do not coop well together... -_-'
					// We have to check properties one by one...
					
					expect( batch.length ).to.be( 3 ) ;
					
					expect( batch[ 0 ].title ).to.be( 'My first post!' ) ;
					expect( batch[ 0 ].content ).to.be( 'Blah blah blah.' ) ;
					expect( batch[ 0 ].parent.collection ).to.be( 'blogs' ) ;
					expect( batch[ 0 ].parent.id.toString() ).to.be( blogId.toString() ) ;
					
					expect( batch[ 1 ].title ).to.be( 'My second post!' ) ;
					expect( batch[ 1 ].content ).to.be( 'Hi ho!' ) ;
					expect( batch[ 1 ].parent.collection ).to.be( 'blogs' ) ;
					expect( batch[ 1 ].parent.id.toString() ).to.be( blogId.toString() ) ;
					
					expect( batch[ 2 ].title ).to.be( 'My third post!' ) ;
					expect( batch[ 2 ].content ).to.be( 'Yay!' ) ;
					expect( batch[ 2 ].parent.collection ).to.be( 'blogs' ) ;
					expect( batch[ 2 ].parent.id.toString() ).to.be( blogId.toString() ) ;
					
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "POST on nested object should set the parent property correctly" , function( done ) {
		
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
					description: 'This is a supa blog!' ,
					otherAccess: restQuery.accessLevel.ALL
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
					parent: { collection: 'blogs', id: blogId }
				} ) ;
				postId = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			*/
			function( callback ) {
				app.root.post(
					'/Blogs/' + blogId + '/Posts' ,
					{
						title: 'My first post!!!' ,
						content: 'Blah blah blah...' ,
						parent: 'should not overwrite' ,
						otherAccess: restQuery.accessLevel.ALL
					} ,
					{ performer: performer } ,
					function( error , rawDocument ) {
						if ( error ) { callback( error ) ; return ; }
						postId = rawDocument.id ;
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
					expect( object.parent.collection ).to.be( 'blogs' ) ;
					expect( object.parent.id.toString() ).to.be( blogId.toString() ) ;
					callback() ;
				} ) ;
			}
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
					description: 'This is a supa blog!' ,
					otherAccess: restQuery.accessLevel.ALL
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
					parent: { collection: 'blogs', id: blogId }
				} ) ;
				postId = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			*/
			function( callback ) {
				app.root.put(
					'/Blogs/' + blogId + '/Posts/' + postId ,
					{
						title: 'My first post!!!' ,
						content: 'Blah blah blah...' ,
						parent: 'should not overwrite' ,
						otherAccess: restQuery.accessLevel.ALL
					} ,
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
					expect( object.parent.collection ).to.be( 'blogs' ) ;
					expect( object.parent.id.toString() ).to.be( blogId.toString() ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put(
					'/Blogs/' + blogId + '/Posts/' + postId ,
					{
						title: 'My first post???' ,
						content: 'Blah?' ,
						parent: 'should not overwrite' ,
						otherAccess: restQuery.accessLevel.ALL
					} ,
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
					expect( object.parent.collection ).to.be( 'blogs' ) ;
					expect( object.parent.id.toString() ).to.be( blogId.toString() ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT on an existed, nested item, with bad ancestry chain" , function( done ) {
		
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
					description: 'This is a supa blog!' ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				blogId = blog.$._id ;
				blog.save( callback ) ;
			} ,
			function( callback ) {
				anotherBlog = app.root.children.blogs.collection.createDocument( {
					title: 'Another blog' ,
					description: 'Oh yeah' ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				anotherBlogId = anotherBlog.$._id ;
				anotherBlog.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My second post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: restQuery.accessLevel.ALL
				} ) ;
				postId = post.$._id ;
				//console.log( "postId: " , postId ) ;
				post.save( callback ) ;
			} ,
			// Ancestry mismatch
			function( callback ) {
				app.root.put(
					'/Blogs/' + anotherBlogId + '/Posts/' + postId ,
					{
						title: 'My edited post!' ,
						content: 'Plop.' ,
						otherAccess: restQuery.accessLevel.ALL
					} ,
					{ performer: performer } ,
					function( error , object ) {
						expect( error ).to.be.ok() ;
						expect( error.type ).to.be( 'badRequest' ) ;
						expect( error.httpStatus ).to.be( 400 ) ;
						expect( error.message ).to.be( 'Ambigous PUT request: this ID exists but is the child of another parent.' ) ;
						expect( object ).to.be( undefined ) ;
						callback() ;
					}
				) ;
			} ,
			// Should not be edited
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( 'My second post!' ) ;
					expect( object.content ).to.be( 'Blah blah blah.' ) ;
					expect( object.parent.collection ).to.be( 'blogs' ) ;
					expect( object.parent.id.toString() ).to.be( blogId.toString() ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
} ) ;



describe( "Users" , function() {
	
	it( "GET on an unexisting user" ) ;
	
	it( "GET on a regular user" ) ;
	
	it( "POST then GET" ) ;
	
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
				app.root.put( '/Users/5437f846e41d0e910ec9a5d8' , {
					firstName: "Joe",
					lastName: "Doe",
					email: "joe.doe@gmail.com",
					password: "pw"
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
				app.root.get( '/Users/5437f846e41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.firstName ).to.be( 'Joe' ) ;
					expect( object.lastName ).to.be( 'Doe' ) ;
					expect( object.slugId ).to.be( 'joe-doe' ) ;
					expect( object.email ).to.be( 'joe.doe@gmail.com' ) ;
					//console.log( object.password ) ;
					expect( object.password ).to.be.an( 'object' ) ;
					expect( object.password.algo ).to.be( 'sha512' ) ;
					expect( object.password.salt ).to.be.a( 'string' ) ;
					expect( object.password.hash ).to.be.a( 'string' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT, then PUT (overwrite), then GET" ) ;
	
	it( "PATCH on an unexisting user" ) ;
	
	it( "PUT, then PATCH, then GET" ) ;
	
	it( "DELETE on an unexisting user" ) ;
	
	it( "PUT, then DELETE, then GET" ) ;
} ) ;



describe( "Groups" , function() {
	
	it( "GET on an unexisting group" ) ;
	
	it( "GET on a regular group" ) ;
	
	it( "POST then GET" ) ;
	
	it( "PUT then GET" ) ;
	
	it( "PUT, then PUT (overwrite), then GET" ) ;
	
	it( "PATCH on an unexisting user" ) ;
	
	it( "PUT, then PATCH, then GET" ) ;
	
	it( "DELETE on an unexisting user" ) ;
	
	it( "PUT, then DELETE, then GET" ) ;
} ) ;



describe( "Token creation" , function() {
	
	it( "login, a.k.a. token creation using POST /Users/CreateToken" , function( done ) {
		
		var app , performer , id ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "Bobby",
					lastName: "Fisher",
					email: "bobby.fisher@gmail.com",
					password: "pw"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					doormen( { type: 'restQuery.id' } , response.id ) ;
					id = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CreateToken' , {
					by: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "myAgent"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					expect( response.userId.toString() ).to.be( id.toString() ) ;
					expect( response.token.length ).to.be( 27 ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "token creation using a bad login should fail" , function( done ) {
		
		var app , performer , id ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "Bobby",
					lastName: "Fisher",
					email: "bobby.fisher@gmail.com",
					password: "pw"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					doormen( { type: 'restQuery.id' } , response.id ) ;
					id = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CreateToken' , {
					by: "header" ,
					login: "wrong@gmail.com" ,
					password: "pw",
					agentId: "myAgent"
				} , { performer: performer } , function( error , response ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.httpStatus ).to.be( 401 ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "token creation using a bad login should fail" , function( done ) {
		
		var app , performer , id ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "Bobby",
					lastName: "Fisher",
					email: "bobby.fisher@gmail.com",
					password: "pw"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					doormen( { type: 'restQuery.id' } , response.id ) ;
					id = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CreateToken' , {
					by: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "bad pw",
					agentId: "myAgent"
				} , { performer: performer } , function( error , response ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.httpStatus ).to.be( 401 ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
} ) ;



describe( "Access" , function() {
	
	var app , performer ,
		authorizedId , authorizedPerformer ,
		authorizedByGroupId , authorizedByGroupPerformer ,
		notEnoughAuthorizedId , notEnoughAuthorizedPerformer ,
		unauthorizedId , unauthorizedPerformer ,
		authorizedGroupId , unauthorizedGroupId ;
	
	// Create the users for the test
	
	beforeEach( function( done ) {
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "Bobby",
					lastName: "Fisher",
					email: "bobby.fisher@gmail.com",
					password: "pw"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					doormen( { type: 'restQuery.id' } , response.id ) ;
					authorizedId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CreateToken' , {
					by: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "myAgent"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					expect( response.userId.toString() ).to.be( authorizedId.toString() ) ;
					expect( response.token.length ).to.be( 27 ) ;
					
					authorizedPerformer = app.createPerformer( {
						by: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "myAgent"
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "Groupy",
					lastName: "Groups",
					email: "groupy@gmail.com",
					password: "groupy"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					doormen( { type: 'restQuery.id' } , response.id ) ;
					authorizedByGroupId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CreateToken' , {
					by: "header" ,
					login: "groupy@gmail.com" ,
					password: "groupy",
					agentId: "myAgent"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					expect( response.userId.toString() ).to.be( authorizedByGroupId.toString() ) ;
					expect( response.token.length ).to.be( 27 ) ;
					
					authorizedByGroupPerformer = app.createPerformer( {
						by: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "myAgent"
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "not",
					lastName: "enough",
					email: "not-enough@gmail.com",
					password: "notenough"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					doormen( { type: 'restQuery.id' } , response.id ) ;
					notEnoughAuthorizedId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CreateToken' , {
					by: "header" ,
					login: "not-enough@gmail.com" ,
					password: "notenough",
					agentId: "myAgent"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					expect( response.userId.toString() ).to.be( notEnoughAuthorizedId.toString() ) ;
					expect( response.token.length ).to.be( 27 ) ;
					
					notEnoughAuthorizedPerformer = app.createPerformer( {
						by: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "myAgent"
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "Peon",
					lastName: "Peon",
					email: "peon@gmail.com",
					password: "peon"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					doormen( { type: 'restQuery.id' } , response.id ) ;
					unauthorizedId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CreateToken' , {
					by: "header" ,
					login: "peon@gmail.com" ,
					password: "peon",
					agentId: "myAgent"
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					expect( response.userId.toString() ).to.be( unauthorizedId.toString() ) ;
					expect( response.token.length ).to.be( 27 ) ;
					
					unauthorizedPerformer = app.createPerformer( {
						by: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "myAgent"
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Groups' , {
					name: "authorized group",
					users: [ authorizedByGroupId ]
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					doormen( { type: 'restQuery.id' } , response.id ) ;
					authorizedGroupId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Groups' , {
					name: "unauthorized group",
					users: [ authorizedByGroupId ]
				} , { performer: performer } , function( error , response ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					doormen( { type: 'restQuery.id' } , response.id ) ;
					unauthorizedGroupId = response.id ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "GET a restricted resource performed by various connected and non-connected users" , function( done ) {
		
		async.series( [
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.PASS_THROUGH ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.NONE
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedPerformer } , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					debug( 'result of get:' ) ;
					//debug( string.inspect( { style: 'color' , proto: true } , object ) ) ;
					//delete object[''] ;
					//delete object._id ;
					debug( object ) ;
					debug( JSON.stringify( object ) ) ;
					expect( object.title ).to.be( 'My wonderful life 2!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! (x2)' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.message ).to.be( 'Public access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User not listed in specific rights
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: unauthorizedPerformer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User listed, but with too low rights
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: notEnoughAuthorizedPerformer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "GET a collection having restricted resources, performed by various connected and non-connected users" , function( done ) {
		
		async.series( [
			function( callback ) {
				app.root.post( '/Blogs' , {
					title: 'Public' ,
					description: 'This is public' ,
					otherAccess: restQuery.accessLevel.READ
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ ;
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.READ ;
				
				app.root.post( '/Blogs' , {
					title: 'Selective' ,
					description: 'This is selective' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.NONE
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ ;
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.PASS_THROUGH ;
				
				app.root.post( '/Blogs' , {
					title: 'Closed' ,
					description: 'This is closed' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.NONE
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' , { performer: authorizedPerformer } , function( error , batch ) {
					
					if ( error ) { callback( error ) ; return ; }
					//console.log( batch ) ;
					expect( batch.length ).to.be( 3 ) ;
					expect( batch[ 0 ].title ).to.be( 'Public' ) ;
					expect( batch[ 1 ].title ).to.be( 'Selective' ) ;
					expect( batch[ 2 ].title ).to.be( 'Closed' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.get( '/Blogs/' , { performer: performer } , function( error , batch ) {
					
					if ( error ) { callback( error ) ; return ; }
					expect( batch.length ).to.be( 1 ) ;
					expect( batch[ 0 ].title ).to.be( 'Public' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User not listed in specific rights
				app.root.get( '/Blogs/' , { performer: unauthorizedPerformer } , function( error , batch ) {
					
					expect( batch.length ).to.be( 1 ) ;
					expect( batch[ 0 ].title ).to.be( 'Public' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User listed, but with too low rights
				app.root.get( '/Blogs/' , { performer: notEnoughAuthorizedPerformer } , function( error , batch ) {
					
					expect( batch.length ).to.be( 2 ) ;
					expect( batch[ 0 ].title ).to.be( 'Public' ) ;
					expect( batch[ 1 ].title ).to.be( 'Selective' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT (overwrite) a restricted resource performed by various connected and non-connected users" , function( done ) {
		
		async.series( [
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ_CREATE_MODIFY ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.READ_CREATE ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.NONE
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ_CREATE_MODIFY ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.READ ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I've changed my mind!" ,
					description: 'Seriously!' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.NONE
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I cant do that!" ,
					description: 'Seriously!'
				} , { performer: performer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.message ).to.be( 'Public access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User not listed in specific rights
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I cant do that!" ,
					description: 'Seriously!'
				} , { performer: unauthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User listed, but with too low rights
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I cant do that!" ,
					description: 'Seriously!'
				} , { performer: notEnoughAuthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PATCH a restricted resource performed by various connected and non-connected users" , function( done ) {
		
		async.series( [
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ_CREATE_MODIFY ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.READ_CREATE ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.NONE
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I've changed my mind!"
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I cant do that!"
				} , { performer: performer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.message ).to.be( 'Public access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User not listed in specific rights
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I cant do that!"
				} , { performer: unauthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User listed, but with too low rights
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I cant do that!"
				} , { performer: notEnoughAuthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "DELETE a restricted resource performed by various connected and non-connected users" , function( done ) {
		
		async.series( [
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.ALL ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.READ_CREATE_MODIFY ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.NONE
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.delete( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.message ).to.be( 'Public access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User not listed in specific rights
				app.root.delete( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: unauthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User listed, but with too low rights
				app.root.delete( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: notEnoughAuthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.delete( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT (create) into a restricted resource performed by various connected and non-connected users" , function( done ) {
		
		async.series( [
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ_CREATE ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.READ ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.NONE
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: 'Put one' ,
					content: 'Blah blah blah...' ,
					otherAccess: restQuery.accessLevel.READ
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d1' , {
					title: 'Put two' ,
					content: 'Blah blah blah...' ,
					otherAccess: restQuery.accessLevel.READ
				} , { performer: performer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.message ).to.be( 'Public access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User not listed in specific rights
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d2' , {
					title: 'Put three' ,
					content: 'Blah blah blah...' ,
					otherAccess: restQuery.accessLevel.READ
				} , { performer: unauthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User listed, but with too low rights
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d3' , {
					title: 'Put four' ,
					content: 'Blah blah blah...' ,
					otherAccess: restQuery.accessLevel.READ
				} , { performer: notEnoughAuthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "POST into a restricted resource performed by various connected and non-connected users" , function( done ) {
		
		async.series( [
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ_CREATE ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.READ ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.NONE
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' , {
					title: 'Post one' ,
					content: 'Blah blah blah...' ,
					otherAccess: restQuery.accessLevel.READ
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' , {
					title: 'Post two' ,
					content: 'Blah blah blah...' ,
					otherAccess: restQuery.accessLevel.READ
				} , { performer: performer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.message ).to.be( 'Public access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User not listed in specific rights
				app.root.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' , {
					title: 'Post three' ,
					content: 'Blah blah blah...' ,
					otherAccess: restQuery.accessLevel.READ
				} , { performer: unauthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User listed, but with too low rights
				app.root.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' , {
					title: 'Post four' ,
					content: 'Blah blah blah...' ,
					otherAccess: restQuery.accessLevel.READ
				} , { performer: notEnoughAuthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PATCH of nested resource with inheritAccess: all" , function( done ) {
		
		async.series( [
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ_CREATE_MODIFY ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.READ_CREATE ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.PASS_THROUGH
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: 'Inheritance: all' ,
					content: 'Blah blah blah...' ,
					inheritAccess: 'all'
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I've changed my mind!"
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I've changed my mind!"
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I can't do that!"
				} , { performer: performer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.message ).to.be( 'Public access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User not listed in specific rights
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I can't do that!"
				} , { performer: unauthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User listed, but with too low rights
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I can't do that!"
				} , { performer: notEnoughAuthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PATCH of nested resource with inheritAccess: min" , function( done ) {
		
		async.series( [
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ_CREATE_MODIFY ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.READ_CREATE_MODIFY ;	// will be lowered in the child
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.READ_CREATE_MODIFY	// will be lowered in the child
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ_CREATE_MODIFY ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.READ_CREATE ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: 'Inheritance: min' ,
					content: 'Blah blah blah...' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.READ_CREATE ,
					inheritAccess: 'min'
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I've changed my mind!"
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I've changed my mind!"
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I can't do that!"
				} , { performer: performer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.message ).to.be( 'Public access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User not listed in specific rights
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I can't do that!"
				} , { performer: unauthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User listed, but with too low rights
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I can't do that!"
				} , { performer: notEnoughAuthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PATCH of nested resource with inheritAccess: max" , function( done ) {
		
		async.series( [
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ_CREATE_MODIFY ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.PASS_THROUGH ;	// will be raised in the child
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.PASS_THROUGH
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ_CREATE_MODIFY ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = restQuery.accessLevel.READ_CREATE_MODIFY ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: 'Inheritance: max' ,
					content: 'Blah blah blah...' ,
					userAccess: userAccess ,
					otherAccess: restQuery.accessLevel.READ ,
					inheritAccess: 'max'
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I've changed my mind!"
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: performer } , function( error , rawDocument ) {
					expect( error ).not.to.be.ok() ;
					expect( rawDocument.title ).to.be( "I've changed my mind!" ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I can't do that!"
				} , { performer: performer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.message ).to.be( 'Public access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User not listed in specific rights
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I can't do that!"
				} , { performer: unauthorizedPerformer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User listed, but with too low rights
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "Yeah! I can change that!"
				} , { performer: notEnoughAuthorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user should be able to read
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: performer } , function( error , rawDocument ) {
					expect( error ).not.to.be.ok() ;
					expect( rawDocument.title ).to.be( "Yeah! I can change that!" ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "Groups" , function( done ) {
		
		async.series( [
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = restQuery.accessLevel.READ ;
				userAccess[ authorizedByGroupId ] = restQuery.accessLevel.PASS_THROUGH ;
				
				var groupAccess = {} ;
				groupAccess[ authorizedGroupId ] = restQuery.accessLevel.READ ;
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					groupAccess: groupAccess ,
					otherAccess: restQuery.accessLevel.NONE
				} , { performer: authorizedPerformer } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					debug( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedPerformer } , function( error , object ) {
					if ( error ) { callback( error ) ; return ; }
					expect( object.title ).to.be( 'My wonderful life 2!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! (x2)' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User authorized by its group
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedByGroupPerformer } , function( error , object ) {
					if ( error ) { console.log( "#### Group: not OK" ) ; callback( error ) ; return ; }
					expect( object.title ).to.be( 'My wonderful life 2!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! (x2)' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.message ).to.be( 'Public access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User not listed in specific rights
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: unauthorizedPerformer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User listed, but with too low rights
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: notEnoughAuthorizedPerformer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'forbidden' ) ;
					expect( error.message ).to.be( 'Access forbidden.' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
} ) ;



describe( "App config" , function() {
	
	it( "Test loading a JSON config" ) ;
} ) ;



describe( "Indexes" , function() {
	
	it( "Test indexes" ) ;
} ) ;
		


describe( "Misc" , function() {
	
	it( "Test CORS" ) ;
} ) ;
		



