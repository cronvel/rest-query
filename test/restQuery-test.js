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



var cliOptions = getCliOptions() ;



// Useless now?
/*
var smartPreprocessor = require( 'smart-preprocessor' ) ;
var restQuery = cli['log-lib'] ?
	smartPreprocessor.require( __dirname + '/../lib/restQuery.js' , { debug: true } ) :
	require( '../lib/restQuery.js' ) ;
*/

var restQuery = require( '../lib/restQuery.js' ) ;

var Logfella = require( 'logfella' ) ;

if ( cliOptions.overrideConsole === undefined ) { cliOptions.overrideConsole = false ; }
if ( ! cliOptions.log ) { cliOptions.log = { minLevel: 4 } ; }
var log = Logfella.global.use( 'mocha' ) ;

var async = require( 'async-kit' ) ;
var tree = require( 'tree-kit' ) ;
var string = require( 'string-kit' ) ;
var rootsDb = require( 'roots-db' ) ;

var mongodb = require( 'mongodb' ) ;

var expect = require( 'expect.js' ) ;
var doormen = require( 'doormen' ) ;

var fsKit = require( 'fs-kit' ) ;





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



function clearCollection( collection , callback )
{
	collection.driver.rawInit( function( error ) {
		if ( error ) { callback( error ) ; return ; }
		collection.driver.raw.remove( function( error ) {
			if ( ! collection.attachmentUrl ) { callback( error ) ; return ; }
			
			fsKit.deltree( collection.attachmentUrl , callback ) ;
		} ) ;
	} ) ;
}



var currentApp ;

function commonApp( callback )
{
	if ( currentApp ) { currentApp.shutdown() ; }
	
	var app = restQuery.createApp( __dirname + '/../sample/main.json' , cliOptions ) ;
	var performer = app.createPerformer() ;
	
	currentApp = app ;
	
	async.parallel( [
		[ clearCollection , app.collectionNodes.users.collection ] ,
		[ clearCollection , app.collectionNodes.groups.collection ] ,
		[ clearCollection , app.collectionNodes.blogs.collection ] ,
		[ clearCollection , app.collectionNodes.posts.collection ] ,
		[ clearCollection , app.collectionNodes.comments.collection ]
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



describe( "App config" , function() {
	
	// Nothing special to test here: the whole test would fail if it wasn't working...
	// Finer tests should be done later.
	it( "Test loading a full config" , function() {} ) ;
} ) ;



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
					otherAccess: 'all'
				} ) ;
				id = blog._id ;
				blog.$.save( callback ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( '/Blogs/' + id , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'My wonderful life' ) ;
					expect( object.description ).to.be( 'This is a supa blog!' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "GET on a property of a regular item" , function( done ) {
		
		var app , performer , blog , id , randomId = new mongodb.ObjectID() ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ randomId ] = 'read' ;	// Random unexistant ID
				
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'My wonderful life' ,
					description: 'This is a supa blog!' ,
					otherAccess: 'all' ,
					userAccess: userAccess
				} ) ;
				id = blog._id ;
				blog.$.save( callback ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + id + '/.title' , { performer: performer } , function( error , title ) {
					expect( error ).not.to.be.ok() ;
					expect( title ).to.be( 'My wonderful life' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + id + '/.userAccess.' + randomId , { performer: performer } , function( error , access ) {
					expect( error ).not.to.be.ok() ;
					expect( access ).to.be( 'read' ) ;
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
					otherAccess: 'all'
				} , null , { performer: performer } , function( error , rawDocument ) {
					expect( error ).not.to.be.ok() ;
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
					expect( error ).not.to.be.ok() ;
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
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 3!!!' ,
					description: 'This is a supa blog! Now overwritten!' ,
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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
				} , null , { performer: performer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					expect( error.httpStatus ).to.be( 404 ) ;
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
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					description: 'This is a supa blog! Now patched!' ,
					"embedded.a": 'A' ,
					parent: "should not overwrite" ,
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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
	
	it( "PUT, then PATCH on a property, then GET (featuring embedded data)" , function( done ) {
		
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
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/.embedded' , { a: 'omg' } , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'My wonderful life 3!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! (x3)' ) ;
					expect( object.embedded ).to.eql( { a: 'omg' , b: 'b' } ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT, then PUT (overwrite) on a property, then GET" , function( done ) {
		
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
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/.title' , "Change dat title." , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'Change dat title.' ) ;
					expect( object.description ).to.be( 'This is a supa blog! (x3)' ) ;
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
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.delete( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
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
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "DELETE on a property of an object" ) ;
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
					expect( error ).not.to.be.ok() ;
					
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
					otherAccess: 'all'
				} ) ;
				id1 = blog._id ;
				blog.$.save( callback ) ;
			} ,
			function( callback ) {
				blog = app.root.children.blogs.collection.createDocument( {
					title: 'YAB' ,
					description: 'Yet Another Blog' ,
					otherAccess: 'all'
				} ) ;
				id2 = blog._id ;
				blog.$.save( callback ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs' , { performer: performer } , function( error , batch ) {
					expect( error ).not.to.be.ok() ;
					
					expect( batch ).to.be.eql( [
						{
							title: 'My wonderful life',
							description: 'This is a supa blog!',
							_id: id1,
							//embedded: undefined,
							parent: { id: '/', collection: null },
							userAccess: {},
							groupAccess: {},
							otherAccess: 'all',
							inheritAccess: 'none',
							slugId: batch[ 0 ].slugId		// cannot be predicted
						} ,
						{
							title: 'YAB' ,
							description: 'Yet Another Blog' ,
							_id: id2,
							//embedded: undefined,
							parent: { id: '/', collection: null },
							userAccess: {},
							groupAccess: {},
							otherAccess: 'all',
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
					otherAccess: 'all'
				} ) ;
				blogId = blog._id ;
				blog.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: 'all'
				} ) ;
				postId = post._id ;
				//console.log( "postId: " , postId ) ;
				post.$.save( callback ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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
					otherAccess: 'all'
				} ) ;
				blogId = blog._id ;
				blog.$.save( callback ) ;
			} ,
			function( callback ) {
				anotherBlog = app.root.children.blogs.collection.createDocument( {
					title: 'Another blog' ,
					description: 'Oh yeah' ,
					otherAccess: 'all'
				} ) ;
				anotherBlogId = anotherBlog._id ;
				anotherBlog.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My second post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs' , id: blogId } ,
					otherAccess: 'all'
				} ) ;
				postId = post._id ;
				//console.log( "postId: " , postId ) ;
				post.$.save( callback ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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
					otherAccess: 'all'
				} ) ;
				blogId = blog._id ;
				blog.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: 'all'
				} ) ;
				postId = post._id ;
				//console.log( "postId: " , postId ) ;
				post.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				comment = app.root.children.blogs.children.posts.children.comments.collection.createDocument( {
					title: 'nope!' ,
					content: 'First!' ,
					parent: { collection: 'posts', id: postId } ,
					otherAccess: 'all'
				} ) ;
				commentId = comment._id ;
				//console.log( "commentId: " , commentId ) ;
				comment.$.save( callback ) ;
			} ,
			/*
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				comment = app.root.children.blogs.children.posts.children.comments.collection.get( commentId , function( error , doc ) {
					//console.log( string.inspect( { style: 'color' , proto: true } , doc ) ) ;
					callback() ;
				} ) ;
			} ,
			//*/
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId + '/Comments/' + commentId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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
					otherAccess: 'all'
				} ) ;
				blogId = blog._id ;
				blog.$.save( callback ) ;
			} ,
			function( callback ) {
				anotherBlog = app.root.children.blogs.collection.createDocument( {
					title: 'Another blog' ,
					description: 'Oh yeah' ,
					otherAccess: 'all'
				} ) ;
				anotherBlogId = anotherBlog._id ;
				anotherBlog.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: 'all'
				} ) ;
				postId = post._id ;
				//console.log( "postId: " , postId ) ;
				post.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				anotherPost = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My second post!' ,
					content: 'Blih blih blih.' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: 'all'
				} ) ;
				anotherPostId = anotherPost._id ;
				//console.log( "postId: " , postId ) ;
				anotherPost.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				comment = app.root.children.blogs.children.posts.children.comments.collection.createDocument( {
					title: 'nope!' ,
					content: 'First!' ,
					parent: { collection: 'posts', id: postId } ,
					otherAccess: 'all'
				} ) ;
				commentId = comment._id ;
				//console.log( "commentId: " , commentId ) ;
				comment.$.save( callback ) ;
			} ,
			/*
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				comment = app.root.children.blogs.children.posts.children.comments.collection.get( commentId , function( error , doc ) {
					//console.log( string.inspect( { style: 'color' , proto: true } , doc ) ) ;
					callback() ;
				} ) ;
			} ,
			//*/
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId + '/Comments/' + commentId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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
					otherAccess: 'all'
				} ) ;
				blogId = blog._id ;
				blog.$.save( callback ) ;
			} ,
			function( callback ) {
				anotherBlog = app.root.children.blogs.collection.createDocument( {
					title: 'Another blog' ,
					description: 'Oh yeah' ,
					otherAccess: 'all'
				} ) ;
				anotherBlogId = anotherBlog._id ;
				anotherBlog.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: 'all'
				} ) ;
				postId1 = post._id ;
				//console.log( "postId: " , postId ) ;
				post.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My second post!' ,
					content: 'Hi ho!' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: 'all'
				} ) ;
				postId2 = post._id ;
				//console.log( "postId: " , postId ) ;
				post.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My alternate post!' ,
					content: 'It does not belong to the same blog!' ,
					parent: { collection: 'blogs', id: anotherBlogId } ,
					otherAccess: 'all'
				} ) ;
				postIdAlt = post._id ;
				//console.log( "postId: " , postId ) ;
				post.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My third post!' ,
					content: 'Yay!' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: 'all'
				} ) ;
				postId3 = post._id ;
				//console.log( "postId: " , postId ) ;
				post.$.save( callback ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts' , { performer: performer } , function( error , batch ) {
					
					var i ;
					
					expect( error ).not.to.be.ok() ;
					
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
					otherAccess: 'all'
				} ) ;
				blogId = blog._id ;
				blog.$.save( callback ) ;
			} ,
			/*
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId }
				} ) ;
				postId = post._id ;
				//console.log( "postId: " , postId ) ;
				post.$.save( callback ) ;
			} ,
			*/
			function( callback ) {
				app.root.post(
					'/Blogs/' + blogId + '/Posts' ,
					{
						title: 'My first post!!!' ,
						content: 'Blah blah blah...' ,
						parent: 'should not overwrite' ,
						otherAccess: 'all'
					} ,
					null ,
					{ performer: performer } ,
					function( error , rawDocument ) {
						expect( error ).not.to.be.ok() ;
						postId = rawDocument.id ;
						callback() ;
					}
				) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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
					otherAccess: 'all'
				} ) ;
				blogId = blog._id ;
				blog.$.save( callback ) ;
			} ,
			/*
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My first post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId }
				} ) ;
				postId = post._id ;
				//console.log( "postId: " , postId ) ;
				post.$.save( callback ) ;
			} ,
			*/
			function( callback ) {
				app.root.put(
					'/Blogs/' + blogId + '/Posts/' + postId ,
					{
						title: 'My first post!!!' ,
						content: 'Blah blah blah...' ,
						parent: 'should not overwrite' ,
						otherAccess: 'all'
					} ,
					null , { performer: performer } ,
					function( error , object ) {
						expect( error ).not.to.be.ok() ;
						callback() ;
					}
				) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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
						otherAccess: 'all'
					} ,
					null , { performer: performer } ,
					function( error , object ) {
						expect( error ).not.to.be.ok() ;
						callback() ;
					}
				) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + blogId + '/Posts/' + postId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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
					otherAccess: 'all'
				} ) ;
				blogId = blog._id ;
				blog.$.save( callback ) ;
			} ,
			function( callback ) {
				anotherBlog = app.root.children.blogs.collection.createDocument( {
					title: 'Another blog' ,
					description: 'Oh yeah' ,
					otherAccess: 'all'
				} ) ;
				anotherBlogId = anotherBlog._id ;
				anotherBlog.$.save( callback ) ;
			} ,
			function( callback ) {
				//console.log( string.inspect( { style: 'color' } , app.root.children ) ) ;
				post = app.root.children.blogs.children.posts.collection.createDocument( {
					title: 'My second post!' ,
					content: 'Blah blah blah.' ,
					parent: { collection: 'blogs', id: blogId } ,
					otherAccess: 'all'
				} ) ;
				postId = post._id ;
				//console.log( "postId: " , postId ) ;
				post.$.save( callback ) ;
			} ,
			// Ancestry mismatch
			function( callback ) {
				app.root.put(
					'/Blogs/' + anotherBlogId + '/Posts/' + postId ,
					{
						title: 'My edited post!' ,
						content: 'Plop.' ,
						otherAccess: 'all'
					} ,
					null , { performer: performer } ,
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



describe( "Links" , function() {
	
	it( "GET on a link" , function( done ) {
		
		var app , performer , blog , id , userId , godfatherId ;
		
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
					firstName: "THE",
					lastName: "GODFATHER",
					email: "godfather@gmail.com",
					password: "pw",
					otherAccess: "all"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					godfatherId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "Joe",
					lastName: "Doe",
					email: "joe.doe@gmail.com",
					password: "pw",
					otherAccess: "all",
					godfather: godfatherId
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					userId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + userId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					
					expect( object.firstName ).to.be( 'Joe' ) ;
					expect( object.lastName ).to.be( 'Doe' ) ;
					expect( object.slugId ).to.be( 'joe-doe' ) ;
					expect( object.email ).to.be( 'joe.doe@gmail.com' ) ;
					expect( object.godfather.toString() ).to.be( godfatherId.toString() ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + userId + '/~godfather' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					
					expect( object.firstName ).to.be( 'THE' ) ;
					expect( object.lastName ).to.be( 'GODFATHER' ) ;
					expect( object.slugId ).to.be( 'the-godfather' ) ;
					expect( object.email ).to.be( 'godfather@gmail.com' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT (create) on a link" , function( done ) {
		
		var app , performer , blog , id , userId , godfatherId ;
		
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
					firstName: "Joe",
					lastName: "Doe",
					email: "joe.doe@gmail.com",
					password: "pw",
					otherAccess: "all"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					userId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Users/' + userId + '/~godfather' , {
						firstName: "DAT",
						lastName: "GODFATHER!",
						email: "godfather@gmail.com",
						password: "pw",
						otherAccess: "all"
					} ,
					null , { performer: performer } ,
					function( error , response ) {
						expect( error ).not.to.be.ok() ;
						godfatherId = response.id ;
						callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + userId + '/~godfather' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					
					expect( object.firstName ).to.be( 'DAT' ) ;
					expect( object.lastName ).to.be( 'GODFATHER!' ) ;
					expect( object.slugId ).to.be( 'dat-godfather' ) ;
					expect( object.email ).to.be( 'godfather@gmail.com' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + godfatherId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					
					expect( object.firstName ).to.be( 'DAT' ) ;
					expect( object.lastName ).to.be( 'GODFATHER!' ) ;
					expect( object.slugId ).to.be( 'dat-godfather' ) ;
					expect( object.email ).to.be( 'godfather@gmail.com' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PUT (overwrite) on a link" , function( done ) {
		
		var app , performer , blog , id , userId , godfatherId ;
		
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
					firstName: "THE",
					lastName: "GODFATHER",
					email: "godfather@gmail.com",
					password: "pw",
					otherAccess: "all"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					godfatherId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "Joe",
					lastName: "Doe",
					email: "joe.doe@gmail.com",
					password: "pw",
					otherAccess: "all",
					godfather: godfatherId
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					userId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + userId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					
					expect( object.firstName ).to.be( 'Joe' ) ;
					expect( object.lastName ).to.be( 'Doe' ) ;
					expect( object.slugId ).to.be( 'joe-doe' ) ;
					expect( object.email ).to.be( 'joe.doe@gmail.com' ) ;
					expect( object.godfather.toString() ).to.be( godfatherId.toString() ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Users/' + userId + '/~godfather' , {
						firstName: "DAT",
						lastName: "GODFATHER!",
						email: "godfather@gmail.com",
						password: "pw",
						otherAccess: "all"
					} ,
					null , { performer: performer } ,
					function( error , object ) {
						expect( error ).not.to.be.ok() ;
						callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + userId + '/~godfather' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					
					expect( object.firstName ).to.be( 'DAT' ) ;
					expect( object.lastName ).to.be( 'GODFATHER!' ) ;
					expect( object.slugId ).to.be( 'the-godfather' ) ;
					expect( object.email ).to.be( 'godfather@gmail.com' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "PATCH on a link" , function( done ) {
		
		var app , performer , blog , id , userId , godfatherId ;
		
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
					firstName: "THE",
					lastName: "GODFATHER",
					email: "godfather@gmail.com",
					password: "pw",
					otherAccess: "all"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					godfatherId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "Joe",
					lastName: "Doe",
					email: "joe.doe@gmail.com",
					password: "pw",
					otherAccess: "all",
					godfather: godfatherId
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					userId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + userId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					
					expect( object.firstName ).to.be( 'Joe' ) ;
					expect( object.lastName ).to.be( 'Doe' ) ;
					expect( object.slugId ).to.be( 'joe-doe' ) ;
					expect( object.email ).to.be( 'joe.doe@gmail.com' ) ;
					expect( object.godfather.toString() ).to.be( godfatherId.toString() ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Users/' + userId + '/~godfather' , { firstName: 'Da' } , null , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + userId + '/~godfather' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					
					expect( object.firstName ).to.be( 'Da' ) ;
					expect( object.lastName ).to.be( 'GODFATHER' ) ;
					expect( object.slugId ).to.be( 'the-godfather' ) ;
					expect( object.email ).to.be( 'godfather@gmail.com' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "DELETE on a link" , function( done ) {
		
		var app , performer , blog , id , userId , godfatherId ;
		
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
					firstName: "THE",
					lastName: "GODFATHER",
					email: "godfather@gmail.com",
					password: "pw",
					otherAccess: "all"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					godfatherId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "Joe",
					lastName: "Doe",
					email: "joe.doe@gmail.com",
					password: "pw",
					otherAccess: "all",
					godfather: godfatherId
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					userId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + userId , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					
					expect( object.firstName ).to.be( 'Joe' ) ;
					expect( object.lastName ).to.be( 'Doe' ) ;
					expect( object.slugId ).to.be( 'joe-doe' ) ;
					expect( object.email ).to.be( 'joe.doe@gmail.com' ) ;
					expect( object.godfather.toString() ).to.be( godfatherId.toString() ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.delete( '/Users/' + userId + '/~godfather' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + userId + '/~godfather' , { performer: performer } , function( error , object ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + godfatherId , { performer: performer } , function( error , object ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "POST on a link should fail (it doesn't make sense)" , function( done ) {
		
		var app , performer , blog , id , userId , godfatherId ;
		
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
					firstName: "Joe",
					lastName: "Doe",
					email: "joe.doe@gmail.com",
					password: "pw",
					otherAccess: "all"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					userId = response.id ;
					callback() ;
				} ) ;
			} ,
			
			// POST when the link does not exist
			function( callback ) {
				app.root.post( '/Users/' + userId + '/~godfather' , {
						firstName: "DAT",
						lastName: "GODFATHER!",
						email: "godfather@gmail.com",
						password: "pw",
						otherAccess: "all"
					} ,
					null ,
					{ performer: performer } ,
					function( error , response ) {
						expect( error ).to.be.ok() ;
						expect( error.type ).to.be( 'notFound' ) ;
						callback() ;
				} ) ;
			} ,
			
			
			function( callback ) {
				app.root.put( '/Users/' + userId + '/~godfather' , {
						firstName: "DAT",
						lastName: "GODFATHER!",
						email: "godfather@gmail.com",
						password: "pw",
						otherAccess: "all"
					} ,
					null , { performer: performer } ,
					function( error , response ) {
						expect( error ).not.to.be.ok() ;
						godfatherId = response.id ;
						callback() ;
				} ) ;
			} ,
			
			
			// POST when the link exist
			function( callback ) {
				app.root.post( '/Users/' + userId + '/~godfather' , {
						firstName: "DAT",
						lastName: "GODFATHER!",
						email: "godfather@gmail.com",
						password: "pw",
						otherAccess: "all"
					} ,
					null ,
					{ performer: performer } ,
					function( error , response ) {
						expect( error ).to.be.ok() ;
						expect( error.type ).to.be( 'badRequest' ) ;
						callback() ;
				} ) ;
			} ,
		] )
		.exec( done ) ;
	} ) ;
	
	it( "GET + populate links" , function( done ) {
		
		var app , performer , blog , id , userId , fatherId , godfatherId ;
		
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
					firstName: "Big Joe",
					lastName: "Doe",
					email: "big-joe@gmail.com",
					password: "pw",
					otherAccess: "all"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					fatherId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "THE",
					lastName: "GODFATHER",
					email: "godfather@gmail.com",
					password: "pw",
					otherAccess: "all"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					godfatherId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users' , {
					firstName: "Joe",
					lastName: "Doe",
					email: "joe.doe@gmail.com",
					password: "pw",
					otherAccess: "all",
					father: fatherId ,
					godfather: godfatherId
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					userId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var context = {
					performer: performer ,
					query: {
						populate: [ 'father' , 'godfather' ]
					}
				} ;
				
				app.root.get( '/Users/' + userId , context , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					
					expect( object.firstName ).to.be( 'Joe' ) ;
					expect( object.lastName ).to.be( 'Doe' ) ;
					expect( object.slugId ).to.be( 'joe-doe' ) ;
					expect( object.email ).to.be( 'joe.doe@gmail.com' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					
					expect( object.father.firstName ).to.be( 'Big Joe' ) ;
					expect( object.father.lastName ).to.be( 'Doe' ) ;
					expect( object.father.email ).to.be( 'big-joe@gmail.com' ) ;
					
					expect( object.godfather.firstName ).to.be( 'THE' ) ;
					expect( object.godfather.lastName ).to.be( 'GODFATHER' ) ;
					expect( object.godfather.email ).to.be( 'godfather@gmail.com' ) ;
					
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
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				//app.root.get( '/' , function( error , object ) {
				//app.get( '/Blogs/my-blog/Posts/my-first-article/Comment/1' ) ;
				//app.root.get( '/Posts/' , function( error , object ) {
				//app.root.get( '/Blogs/' , function( error , object ) {
				app.root.get( '/Users/5437f846e41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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



describe( "Slug usage" , function() {
	
	it( "when 'slugGenerationProperty' is set on the schema (to an existing property), it should generate a slug from that property's value" , function( done ) {
		
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
					title: 'My wonderful life!!!' ,
					description: 'This is a supa blog!' ,
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'My wonderful life!!!' ) ;
					expect( object.slugId ).to.be( 'my-wonderful-life' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "when a document will generate the same slugId, it should fail with a 409 - Conflict" , function( done ) {
		
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
				app.root.post( '/Blogs' , {
					title: 'My wonderful life!!!' ,
					description: 'This is a supa blog!' ,
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Blogs' , {
					title: 'My wonderful life!!!' ,
					description: 'This is a supa blog 2!' ,
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'conflict' ) ;
					expect( error.code ).to.be( 'duplicateKey' ) ;
					expect( error.httpStatus ).to.be( 409 ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "the request URL should support slugId instead of ID (GET, PUT, PATCH, DELETE)" , function( done ) {
		
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
				app.root.post( '/Blogs' , {
					title: 'My wonderful life!!!' ,
					description: 'This is a supa blog!' ,
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/my-wonderful-life' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'My wonderful life!!!' ) ;
					expect( object.slugId ).to.be( 'my-wonderful-life' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					id = object.$.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Blogs/my-wonderful-life' , {
					title: 'New title!' ,
					description: 'New description!' ,
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + id , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'New title!' ) ;
					expect( object.slugId ).to.be( 'my-wonderful-life' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// It should not change its slug
				app.root.get( '/Blogs/my-wonderful-life' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'New title!' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/my-wonderful-life' , {
					title: 'A brand new title!'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + id , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'A brand new title!' ) ;
					expect( object.slugId ).to.be( 'my-wonderful-life' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// It should not change its slug
				app.root.get( '/Blogs/my-wonderful-life' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'A brand new title!' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.delete( '/Blogs/my-wonderful-life' , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' + id , { performer: performer } , function( error , object ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// It should not change its slug
				app.root.get( '/Blogs/my-wonderful-life' , { performer: performer } , function( error , object ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'notFound' ) ;
					callback() ;
				} ) ;
			} ,
		] )
		.exec( done ) ;
	} ) ;
	
} ) ;



describe( "Auto collection" , function() {
	
	it( "Root auto collection" , function( done ) {
		
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
					title: 'My wonderful life!!!' ,
					description: 'This is a supa blog!' ,
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'My wonderful life!!!' ) ;
					expect( object.slugId ).to.be( 'my-wonderful-life' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/5437f846c41d0e910ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'My wonderful life!!!' ) ;
					expect( object.slugId ).to.be( 'my-wonderful-life' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/my-wonderful-life' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'My wonderful life!!!' ) ;
					expect( object.slugId ).to.be( 'my-wonderful-life' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "Collection's auto collection" , function( done ) {
		
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
					title: 'My wonderful life!!!' ,
					description: 'This is a supa blog!' ,
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e9f0ec9a5d8' , {
					title: 'You know what?' ,
					content: "I'm happy!" ,
					otherAccess: 'all'
				} , null , { performer: performer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e9f0ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'You know what?' ) ;
					expect( object.slugId ).to.be( 'you-know-what' ) ;
					expect( object.parent.id.toString() ).to.be( '5437f846c41d0e910ec9a5d8' ) ;
					expect( object.parent.collection ).to.be( 'blogs' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8/5437f846c41d0e9f0ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'You know what?' ) ;
					expect( object.slugId ).to.be( 'you-know-what' ) ;
					expect( object.parent.id.toString() ).to.be( '5437f846c41d0e910ec9a5d8' ) ;
					expect( object.parent.collection ).to.be( 'blogs' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e9f0ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'You know what?' ) ;
					expect( object.slugId ).to.be( 'you-know-what' ) ;
					expect( object.parent.id.toString() ).to.be( '5437f846c41d0e910ec9a5d8' ) ;
					expect( object.parent.collection ).to.be( 'blogs' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/5437f846c41d0e910ec9a5d8/5437f846c41d0e9f0ec9a5d8' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'You know what?' ) ;
					expect( object.slugId ).to.be( 'you-know-what' ) ;
					expect( object.parent.id.toString() ).to.be( '5437f846c41d0e910ec9a5d8' ) ;
					expect( object.parent.collection ).to.be( 'blogs' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/my-wonderful-life/you-know-what' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'You know what?' ) ;
					expect( object.slugId ).to.be( 'you-know-what' ) ;
					expect( object.parent.id.toString() ).to.be( '5437f846c41d0e910ec9a5d8' ) ;
					expect( object.parent.collection ).to.be( 'blogs' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/my-wonderful-life/Posts/you-know-what' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'You know what?' ) ;
					expect( object.slugId ).to.be( 'you-know-what' ) ;
					expect( object.parent.id.toString() ).to.be( '5437f846c41d0e910ec9a5d8' ) ;
					expect( object.parent.collection ).to.be( 'blogs' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/my-wonderful-life/you-know-what' , { performer: performer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'You know what?' ) ;
					expect( object.slugId ).to.be( 'you-know-what' ) ;
					expect( object.parent.id.toString() ).to.be( '5437f846c41d0e910ec9a5d8' ) ;
					expect( object.parent.collection ).to.be( 'blogs' ) ;
					callback() ;
				} ) ;
			} ,
		] )
		.exec( done ) ;
	} ) ;
} ) ;



describe( "Token creation" , function() {
	
	it( "login, a.k.a. token creation using POST /Users/CREATE-TOKEN" , function( done ) {
		
		var app , performer , id , token ;
		
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
					password: "pw",
					otherAccess: 'all'
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					id = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					expect( response ).to.eql( {
						userId: id ,
						token: response.token ,	// unpredictable
						type: "header" ,
						agentId: "0123456789" ,
						creationTime: response.creationTime ,	// not predictable at all
						expirationTime: response.expirationTime ,	// not predictable at all
						duration: 900000
					} ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					var tokenData = app.collectionNodes.users.extractFromToken( response.token ) ;
					
					expect( tokenData ).to.eql( {
						type: "header" ,
						userId: id.toString() ,
						agentId: "0123456789" ,
						expirationTime: response.expirationTime ,
						//increment: tokenData.increment ,	// unpredictable
						securityCode: tokenData.securityCode	// unpredictable
					} ) ;
					
					token = response.token ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Should found the token in the user document 
				app.root.get( '/Users/' + id , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					expect( response.token[ token ] ).to.be.ok() ;
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
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					id = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "wrong@gmail.com" ,
					password: "pw",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.httpStatus ).to.be( 401 ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "token creation using a bad password should fail" , function( done ) {
		
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
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					id = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "bad pw",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.httpStatus ).to.be( 401 ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "using domain-restricted users: POST /Blogs/id/Users/CREATE-TOKEN" , function( done ) {
		
		var app , performer , blogId , id ;
		
		async.series( [
			function( callback ) {
				commonApp( function( error , a , p ) {
					app = a ;
					performer = p ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Blogs' , {
					title: 'My wonderful life' ,
					description: 'This is a supa blog!' ,
					otherAccess: 'all'
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					blogId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Blogs/' + blogId + '/Users' , {
					firstName: "Bobby",
					lastName: "Fisher",
					email: "bobby.fisher@gmail.com",
					password: "pw"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					id = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Blogs/' + blogId + '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					expect( response.userId.toString() ).to.be( id.toString() ) ;
					expect( response.token.length ).to.be( 44 ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Should not works globally!
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).to.be.ok() ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "POST /Users/CREATE-TOKEN action should cleanup outdated tokens" , function( done ) {
		
		var app , performer , id , token ;
		
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
					password: "pw",
					otherAccess: 'all'
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					id = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				
				duration = 300 ;
				
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789",
					duration: duration
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					expect( response ).to.eql( {
						userId: id ,
						token: response.token ,	// unpredictable
						type: "header" ,
						agentId: "0123456789" ,
						creationTime: response.creationTime ,	// not predictable at all
						expirationTime: response.expirationTime ,	// not predictable at all
						duration: duration
					} ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					var tokenData = app.collectionNodes.users.extractFromToken( response.token ) ;
					
					expect( tokenData ).to.eql( {
						type: "header" ,
						userId: id.toString() ,
						agentId: "0123456789" ,
						expirationTime: response.expirationTime ,
						//increment: tokenData.increment ,	// unpredictable
						securityCode: tokenData.securityCode	// unpredictable
					} ) ;
					
					token = response.token ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Should be there
				app.root.get( '/Users/' + id , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					//console.log( response ) ;
					expect( response.token[ token ] ).to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				
				duration = 100000 ;
				
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789",
					duration: duration
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					expect( response ).to.eql( {
						userId: id ,
						token: response.token ,	// unpredictable
						type: "header" ,
						agentId: "0123456789" ,
						creationTime: response.creationTime ,	// not predictable at all
						expirationTime: response.expirationTime ,	// not predictable at all
						duration: duration
					} ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					var tokenData = app.collectionNodes.users.extractFromToken( response.token ) ;
					
					expect( tokenData ).to.eql( {
						type: "header" ,
						userId: id.toString() ,
						agentId: "0123456789" ,
						expirationTime: response.expirationTime ,
						//increment: tokenData.increment ,	// unpredictable
						securityCode: tokenData.securityCode	// unpredictable
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Should still be there
				app.root.get( '/Users/' + id , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					//console.log( token , response ) ;
					expect( response.token[ token ] ).to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				setTimeout( callback , 310 ) ;
			} ,
			function( callback ) {
				
				duration = 100000 ;
				
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789",
					duration: duration
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					expect( response ).to.eql( {
						userId: id ,
						token: response.token ,	// unpredictable
						type: "header" ,
						agentId: "0123456789" ,
						creationTime: response.creationTime ,	// not predictable at all
						expirationTime: response.expirationTime ,
						duration: duration
					} ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					var tokenData = app.collectionNodes.users.extractFromToken( response.token ) ;
					
					expect( tokenData ).to.eql( {
						type: "header" ,
						userId: id.toString() ,
						agentId: "0123456789" ,
						expirationTime: response.expirationTime ,
						//increment: tokenData.increment ,	// unpredictable
						securityCode: tokenData.securityCode	// unpredictable
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Should have been garbage collected
				app.root.get( '/Users/' + id , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					//console.log( response ) ;
					expect( response.token[ token ] ).not.to.be.ok() ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "POST /Users/REGENERATE-TOKEN should generate a new token using an existing one that will have its TTL shortened" , function( done ) {
		
		var app , performer , oldTokenPerformer , id , oldToken , newToken , oldTokenOldExpirationTime ;
		
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
					password: "pw",
					otherAccess: 'all'
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					id = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					
					//console.log( response ) ;
					expect( response ).to.eql( {
						userId: id ,
						token: response.token ,	// unpredictable
						type: "header" ,
						agentId: "0123456789" ,
						creationTime: response.creationTime ,	// not predictable at all
						expirationTime: response.expirationTime ,	// not predictable at all
						duration: 900000
					} ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					var tokenData = app.collectionNodes.users.extractFromToken( response.token ) ;
					
					expect( tokenData ).to.eql( {
						type: "header" ,
						userId: id.toString() ,
						agentId: "0123456789" ,
						expirationTime: response.expirationTime ,
						//increment: tokenData.increment ,	// unpredictable
						securityCode: tokenData.securityCode	// unpredictable
					} ) ;
					
					oldTokenOldExpirationTime = response.expirationTime ;
					oldToken = response.token ;
					
					oldTokenPerformer = app.createPerformer( {
						type: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "0123456789"
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + id , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					//console.log( response ) ;
					expect( response.token[ oldToken ] ).to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/REGENERATE-TOKEN' , {} , null , { performer: oldTokenPerformer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					
					//console.log( response ) ;
					expect( response ).to.eql( {
						userId: id ,
						token: response.token ,	// unpredictable
						type: "header" ,
						agentId: "0123456789" ,
						creationTime: response.creationTime ,	// not predictable at all
						expirationTime: response.expirationTime ,	// not predictable at all
						duration: 900000
					} ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					oldTokenNewExpirationTime = response.creationTime + 10000 ;
					var tokenData = app.collectionNodes.users.extractFromToken( response.token ) ;
					
					expect( tokenData ).to.eql( {
						type: "header" ,
						userId: id.toString() ,
						agentId: "0123456789" ,
						expirationTime: response.expirationTime ,
						//increment: tokenData.increment ,	// unpredictable
						securityCode: tokenData.securityCode	// unpredictable
					} ) ;
					
					newToken = response.token ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// the old token should have been garbage collected
				app.root.get( '/Users/' + id , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					//console.log( response ) ;
					expect( response.token[ oldToken ] ).to.be.ok() ;
					expect( response.token[ oldToken ].expirationTime ).not.to.be( oldTokenOldExpirationTime ) ;
					expect( response.token[ oldToken ].expirationTime ).to.be.within( oldTokenNewExpirationTime - 200 , oldTokenNewExpirationTime + 200 ) ;
					expect( response.token[ newToken ] ).to.be.ok() ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "POST /Users/REVOKE-TOKEN should revoke the current token, i.e. remove it from the user document" , function( done ) {
		
		var app , performer , tokenPerformer , tokenPerformerArg , id , token ;
		
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
					password: "pw",
					otherAccess: 'all'
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					id = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					
					//console.log( response ) ;
					expect( response ).to.eql( {
						userId: id ,
						token: response.token ,	// unpredictable
						type: "header" ,
						agentId: "0123456789" ,
						creationTime: response.creationTime ,	// not predictable at all
						expirationTime: response.expirationTime ,	// not predictable at all
						duration: 900000
					} ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					var tokenData = app.collectionNodes.users.extractFromToken( response.token ) ;
					
					expect( tokenData ).to.eql( {
						type: "header" ,
						userId: id.toString() ,
						agentId: "0123456789" ,
						expirationTime: response.expirationTime ,
						//increment: tokenData.increment ,	// unpredictable
						securityCode: tokenData.securityCode	// unpredictable
					} ) ;
					
					token = response.token ;
					
					tokenPerformerArg = {
						type: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "0123456789"
					} ;
					
					tokenPerformer = app.createPerformer( tokenPerformerArg ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + id , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					//console.log( response ) ;
					expect( response.token[ token ] ).to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/REVOKE-TOKEN' , {} , null , { performer: tokenPerformer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + id , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					//console.log( response ) ;
					expect( response.token[ token ] ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// We recreate a new performer, or the test will fail: it will use a cached user.
				// It's worth noting here that a new performer IS ACTUALLY CREATED for each request in real apps.
				tokenPerformer = app.createPerformer( tokenPerformerArg ) ;
				
				app.root.post( '/Users/REVOKE-TOKEN' , {} , null , { performer: tokenPerformer } , function( error , response ) {
					expect( error ).to.be.ok() ;
					expect( error.message ).to.be( 'Token not found.' ) ;
					callback() ;
				} ) ;
			} ,
		] )
		.exec( done ) ;
	} ) ;
	
	it( "POST /Users/REVOKE-ALL-TOKENS should revoke the all tokens, i.e. remove them from the user document" , function( done ) {
		
		var app , id , performer , tokenPerformer , tokenPerformerArg , token , tokenPerformer2 , token2 ;
		
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
					password: "pw",
					otherAccess: 'all'
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					id = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					
					//console.log( response ) ;
					expect( response ).to.eql( {
						userId: id ,
						token: response.token ,	// unpredictable
						type: "header" ,
						agentId: "0123456789" ,
						creationTime: response.creationTime ,	// not predictable at all
						expirationTime: response.expirationTime ,	// not predictable at all
						duration: 900000
					} ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					var tokenData = app.collectionNodes.users.extractFromToken( response.token ) ;
					
					expect( tokenData ).to.eql( {
						type: "header" ,
						userId: id.toString() ,
						agentId: "0123456789" ,
						expirationTime: response.expirationTime ,
						//increment: tokenData.increment ,	// unpredictable
						securityCode: tokenData.securityCode	// unpredictable
					} ) ;
					
					token = response.token ;
					
					tokenPerformerArg = {
						type: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "0123456789"
					} ;
					
					tokenPerformer = app.createPerformer( tokenPerformerArg ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					
					//console.log( response ) ;
					expect( response ).to.eql( {
						userId: id ,
						token: response.token ,	// unpredictable
						type: "header" ,
						agentId: "0123456789" ,
						creationTime: response.creationTime ,	// not predictable at all
						expirationTime: response.expirationTime ,	// not predictable at all
						duration: 900000
					} ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					var tokenData = app.collectionNodes.users.extractFromToken( response.token ) ;
					
					expect( tokenData ).to.eql( {
						type: "header" ,
						userId: id.toString() ,
						agentId: "0123456789" ,
						expirationTime: response.expirationTime ,
						//increment: tokenData.increment ,	// unpredictable
						securityCode: tokenData.securityCode	// unpredictable
					} ) ;
					
					token2 = response.token ;
					
					tokenPerformer2 = app.createPerformer( {
						type: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "0123456789"
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + id , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					//console.log( response ) ;
					expect( response.token[ token ] ).to.be.ok() ;
					expect( response.token[ token2 ] ).to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/REVOKE-ALL-TOKENS' , {} , null , { performer: tokenPerformer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Users/' + id , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					//console.log( response ) ;
					expect( response.token[ token ] ).not.to.be.ok() ;
					expect( response.token[ token2 ] ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// We recreate a new performer, or the test will fail: it will use a cached user.
				// It's worth noting here that a new performer IS ACTUALLY CREATED for each request in real apps.
				tokenPerformer = app.createPerformer( tokenPerformerArg ) ;
				
				app.root.post( '/Users/REVOKE-TOKEN' , {} , null , { performer: tokenPerformer } , function( error , response ) {
					expect( error ).to.be.ok() ;
					expect( error.message ).to.be( 'Token not found.' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/REVOKE-TOKEN' , {} , null , { performer: tokenPerformer2 } , function( error , response ) {
					expect( error ).to.be.ok() ;
					expect( error.message ).to.be( 'Token not found.' ) ;
					callback() ;
				} ) ;
			}
		] )
		.exec( done ) ;
	} ) ;
	
	it( "'Too many tokens'" ) ;
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
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					authorizedId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					expect( response.userId.toString() ).to.be( authorizedId.toString() ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					authorizedPerformer = app.createPerformer( {
						type: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "0123456789"
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
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					authorizedByGroupId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "groupy@gmail.com" ,
					password: "groupy",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					expect( response.userId.toString() ).to.be( authorizedByGroupId.toString() ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					authorizedByGroupPerformer = app.createPerformer( {
						type: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "0123456789"
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
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					notEnoughAuthorizedId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "not-enough@gmail.com" ,
					password: "notenough",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					expect( response.userId.toString() ).to.be( notEnoughAuthorizedId.toString() ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					notEnoughAuthorizedPerformer = app.createPerformer( {
						type: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "0123456789"
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
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					unauthorizedId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "peon@gmail.com" ,
					password: "peon",
					agentId: "0123456789"
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					expect( response.userId.toString() ).to.be( unauthorizedId.toString() ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					unauthorizedPerformer = app.createPerformer( {
						type: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "0123456789"
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Groups' , {
					name: "unauthorized group",
					users: [ notEnoughAuthorizedId , authorizedByGroupId ]
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					unauthorizedGroupId = response.id ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Groups' , {
					name: "authorized group",
					users: [ authorizedByGroupId ]
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					doormen( { type: 'objectId' } , response.id ) ;
					authorizedGroupId = response.id ;
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
				userAccess[ authorizedId ] = 'read' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'passThrough' ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: 'none'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedPerformer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
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
	
	it( "GET a restricted resource performed by a token that has already expired should fail" , function( done ) {
		
		var expiredTokenPerformer ;
		
		async.series( [
			function( callback ) {
				app.root.post( '/Users/CREATE-TOKEN' , {
					type: "header" ,
					login: "bobby.fisher@gmail.com" ,
					password: "pw",
					agentId: "0123456789",
					duration: 0
				} , null , { performer: performer } , function( error , response ) {
					expect( error ).not.to.be.ok() ;
					expect( response.userId.toString() ).to.be( authorizedId.toString() ) ;
					expect( response.token.length ).to.be( 44 ) ;
					
					expiredTokenPerformer = app.createPerformer( {
						type: "header" ,
						userId: response.userId ,
						token: response.token ,
						agentId: "0123456789"
					} ) ;
					
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = 'read' ;	// Minimal right that pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: 'none'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedPerformer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'My wonderful life 2!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! (x2)' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Expired token
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: expiredTokenPerformer } , function( error , object ) {
					
					expect( error ).to.be.ok() ;
					expect( error.type ).to.be( 'unauthorized' ) ;
					expect( error.message ).to.be( 'This token has already expired.' ) ;
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
					otherAccess: 'read'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = 'read' ;
				userAccess[ notEnoughAuthorizedId ] = 'read' ;
				
				app.root.post( '/Blogs' , {
					title: 'Selective' ,
					description: 'This is selective' ,
					userAccess: userAccess ,
					otherAccess: 'none'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = 'read' ;
				userAccess[ notEnoughAuthorizedId ] = 'passThrough' ;
				
				app.root.post( '/Blogs' , {
					title: 'Closed' ,
					description: 'This is closed' ,
					userAccess: userAccess ,
					otherAccess: 'none'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/' , { performer: authorizedPerformer } , function( error , batch ) {
					
					expect( error ).not.to.be.ok() ;
					//console.log( batch ) ;
					expect( batch.length ).to.be( 3 ) ;
					
					var titles = [ batch[ 0 ].title , batch[ 1 ].title , batch[ 2 ].title ] ;
					
					expect( titles ).to.contain( 'Public' ) ;
					expect( titles ).to.contain( 'Selective' ) ;
					expect( titles ).to.contain( 'Closed' ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.get( '/Blogs/' , { performer: performer } , function( error , batch ) {
					
					expect( error ).not.to.be.ok() ;
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
				userAccess[ authorizedId ] = 'readCreateModify' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'readCreate' ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: 'none'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = 'readCreateModify' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'read' ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I've changed my mind!" ,
					description: 'Seriously!' ,
					userAccess: userAccess ,
					otherAccess: 'none'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I cant do that!" ,
					description: 'Seriously!'
				} , null , { performer: performer } , function( error ) {
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
				} , null , { performer: unauthorizedPerformer } , function( error ) {
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
				} , null , { performer: notEnoughAuthorizedPerformer } , function( error ) {
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
				userAccess[ authorizedId ] = 'readCreateModify' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'readCreate' ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: 'none'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I've changed my mind!"
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: "I cant do that!"
				} , null , { performer: performer } , function( error ) {
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
				} , null , { performer: unauthorizedPerformer } , function( error ) {
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
				} , null , { performer: notEnoughAuthorizedPerformer } , function( error ) {
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
				userAccess[ authorizedId ] = 'all' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'readCreateModify' ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: 'none'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
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
					expect( error ).not.to.be.ok() ;
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
				userAccess[ authorizedId ] = 'readCreate' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'read' ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: 'none'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: 'Put one' ,
					content: 'Blah blah blah...' ,
					otherAccess: 'read'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d1' , {
					title: 'Put two' ,
					content: 'Blah blah blah...' ,
					otherAccess: 'read'
				} , null , { performer: performer } , function( error ) {
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
					otherAccess: 'read'
				} , null , { performer: unauthorizedPerformer } , function( error ) {
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
					otherAccess: 'read'
				} , null , { performer: notEnoughAuthorizedPerformer } , function( error ) {
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
				userAccess[ authorizedId ] = 'readCreate' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'read' ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: 'none'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' , {
					title: 'Post one' ,
					content: 'Blah blah blah...' ,
					otherAccess: 'read'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' , {
					title: 'Post two' ,
					content: 'Blah blah blah...' ,
					otherAccess: 'read'
				} , null , { performer: performer } , function( error ) {
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
					otherAccess: 'read'
				} , null , { performer: unauthorizedPerformer } , function( error ) {
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
					otherAccess: 'read'
				} , null , { performer: notEnoughAuthorizedPerformer } , function( error ) {
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
				userAccess[ authorizedId ] = 'readCreateModify' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'readCreate' ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: 'passThrough'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: 'Inheritance: all' ,
					content: 'Blah blah blah...' ,
					inheritAccess: 'all'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I've changed my mind!"
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I've changed my mind!"
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I can't do that!"
				} , null , { performer: performer } , function( error ) {
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
				} , null , { performer: unauthorizedPerformer } , function( error ) {
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
				} , null , { performer: notEnoughAuthorizedPerformer } , function( error ) {
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
				userAccess[ authorizedId ] = 'readCreateModify' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'readCreateModify' ;	// will be lowered in the child
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: 'readCreateModify'	// will be lowered in the child
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = 'readCreateModify' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'readCreate' ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: 'Inheritance: min' ,
					content: 'Blah blah blah...' ,
					userAccess: userAccess ,
					otherAccess: 'readCreate' ,
					inheritAccess: 'min'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I've changed my mind!"
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I've changed my mind!"
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// Non-connected user
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I can't do that!"
				} , null , { performer: performer } , function( error ) {
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
				} , null , { performer: unauthorizedPerformer } , function( error ) {
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
				} , null , { performer: notEnoughAuthorizedPerformer } , function( error ) {
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
				userAccess[ authorizedId ] = 'readCreateModify' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'passThrough' ;	// will be raised in the child
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					otherAccess: 'passThrough'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = 'readCreateModify' ;	// Minimal right that pass
				userAccess[ notEnoughAuthorizedId ] = 'readCreateModify' ;	// Maximal right that does not pass
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: 'Inheritance: max' ,
					content: 'Blah blah blah...' ,
					userAccess: userAccess ,
					otherAccess: 'read' ,
					inheritAccess: 'max'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , {
					title: "I've changed my mind!"
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
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
				} , null , { performer: performer } , function( error ) {
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
				} , null , { performer: unauthorizedPerformer } , function( error ) {
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
				} , null , { performer: notEnoughAuthorizedPerformer } , function( error ) {
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
	
	it( "Access by groups" , function( done ) {
		
		async.series( [
			function( callback ) {
				var userAccess = {} ;
				userAccess[ authorizedId ] = 'read' ;
				//userAccess[ authorizedByGroupId ] = 'passThrough' ;
				
				var groupAccess = {} ;
				groupAccess[ authorizedGroupId ] = 'read' ;
				
				app.root.put( '/Blogs/5437f846c41d0e910ec9a5d8' , {
					title: 'My wonderful life 2!!!' ,
					description: 'This is a supa blog! (x2)' ,
					userAccess: userAccess ,
					groupAccess: groupAccess ,
					otherAccess: 'none'
				} , null , { performer: authorizedPerformer } , function( error ) {
					expect( error ).not.to.be.ok() ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedPerformer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'My wonderful life 2!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! (x2)' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
					callback() ;
				} ) ;
			} ,
			function( callback ) {
				// User authorized by its group
				app.root.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedByGroupPerformer } , function( error , object ) {
					expect( error ).not.to.be.ok() ;
					expect( object.title ).to.be( 'My wonderful life 2!!!' ) ;
					expect( object.description ).to.be( 'This is a supa blog! (x2)' ) ;
					expect( object.parent ).to.be.eql( { id: '/', collection: null } ) ;
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
		] )
		.exec( done ) ;
	} ) ;
	
} ) ;



describe( "Indexes" , function() {
	
	it( "Test indexes" ) ;
} ) ;



describe( "Hooks" , function() {
	
	it( "Test app's hooks" ) ;
	it( "Test collection's hooks" ) ;
} ) ;



describe( "Scheduler" , function() {
	
	it( "Test the scheduler" ) ;
} ) ;



describe( "Misc" , function() {
	
	it( "Test CORS" ) ;
	it( "Test rootObject" ) ;
} ) ;




