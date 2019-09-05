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

/* global describe, it, before, after, beforeEach, expect */

"use strict" ;



var cliOptions = getCliOptions() ;

var restQuery = require( '..' ) ;

var Logfella = require( 'logfella' ) ;

if ( cliOptions.overrideConsole === undefined ) { cliOptions.overrideConsole = false ; }
if ( ! cliOptions.log ) { cliOptions.log = { minLevel: 4 } ; }
//if ( ! cliOptions.log ) { cliOptions.log = { minLevel: 1 } ; }
var log = Logfella.global.use( 'unit-test' ) ;

var Promise = require( 'seventh' ) ;

var tree = require( 'tree-kit' ) ;
var string = require( 'string-kit' ) ;
var ErrorStatus = require( 'error-status' ) ;
var rootsDb = require( 'roots-db' ) ;

var mongodb = require( 'mongodb' ) ;

var doormen = require( 'doormen' ) ;

var fsKit = require( 'fs-kit' ) ;
var hash = require( 'hash-kit' ) ;



// Collections...
var blogs , posts , comments ;





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



function clearCollection( collection ) {
	return collection.driver.rawInit()
		.then( () => collection.driver.raw.deleteMany( {} ) )
		.then( () => {
			if ( ! collection.attachmentUrl ) { return ; }
			return Promise.promisify( fsKit.deltree , fsKit )( collection.attachmentUrl ) ;
		} ) ;
}



var currentApp ;

async function commonApp( override = null ) {
	if ( currentApp ) { currentApp.shutdown() ; }

	var app = new restQuery.App( __dirname + '/../sample/main.kfg' , override || cliOptions ) ;

	// Create a system performer
	var performer = app.createPerformer( null , true ) ;

	currentApp = app ;

	await Promise.all( [
		clearCollection( app.collectionNodes.root.collection ) ,
		clearCollection( app.collectionNodes.users.collection ) ,
		clearCollection( app.collectionNodes.groups.collection ) ,
		clearCollection( app.collectionNodes.blogs.collection ) ,
		clearCollection( app.collectionNodes.posts.collection ) ,
		clearCollection( app.collectionNodes.comments.collection ) ,
		
		clearCollection( app.versionsCollection )
	] ) ;

	// Sometime .buildIndexes() is really slow (more than 2 seconds) on new mongoDB
	await app.buildIndexes() ;
	
	await app.loadSystemDocuments() ;

	return { app , performer } ;
}





/* Tests */



describe( "App config" , () => {

	// Nothing special to test here: the whole test would fail if it wasn't working...
	// Finer tests should be done later.
	it( "Test loading a full config" , () => {} ) ;
} ) ;



describe( "Basic queries of object of a top-level collection" , () => {

	it( "GET on the root object" , async () => {
		var { app , performer } = await commonApp() ;
		
		var response = await app.get( '/' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			name: '/' ,
			title: 'Root' ,
			description: 'Root object' ,
			userAccess: {} ,
			groupAccess: {} ,
			publicAccess: { traverse: true , read: ['id','content'] , query: true , create: true }
		} ) ;
	} ) ;

	it( "POST on the root object should fail just like on any object" , async () => {
		var { app , performer } = await commonApp() ;
		await expect( () => app.put( '/' ,
			{
				name: '/' ,
				title: 'Root' ,
				description: 'A wonderful website'
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( ErrorStatus , { type: 'badRequest' , httpStatus: 400 } ) ;
	} ) ;

	it( "PUT on the root object should always fail" , async () => {
		var { app , performer } = await commonApp() ;
		await expect( () => app.put( '/' ,
			{
				name: '/' ,
				title: 'Root' ,
				description: 'A wonderful website'
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( ErrorStatus , { type: 'badRequest' , httpStatus: 400 } ) ;
	} ) ;

	it( "PATCH on the root object" , async () => {
		var { app , performer } = await commonApp() ;
		
		var response = await app.patch( '/' ,
			{ description: 'A wonderful website' } ,
			null ,
			{ performer: performer }
		) ;
		
		response = await app.get( '/' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			name: '/' ,
			title: 'Root' ,
			description: 'A wonderful website' ,
			userAccess: {} ,
			groupAccess: {} ,
			publicAccess: { traverse: true , read: ['id','content'] , create: true }
		} ) ;
	} ) ;

	it( "DELETE on the root object should always fail" , async () => {
		var { app , performer } = await commonApp() ;
		await expect( () => app.delete( '/' , { performer: performer } ) ).to.reject( ErrorStatus , { type: 'badRequest' , httpStatus: 400 } ) ;
	} ) ;

	it( "GET on an unexisting item" , async () => {
		var { app , performer } = await commonApp() ;
		await expect( () => app.get( '/Blogs/111111111111111111111111' , { performer: performer } ) ).to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
	} ) ;

	it( "GET on a regular item" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;
		var response = await app.get( '/Blogs/' + blog.getId() , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( { title: 'My wonderful life' , description: 'This is a supa blog!' } ) ;
	} ) ;

	it( "GET on a property of a regular item" , async () => {
		var { app , performer } = await commonApp() ;

		var randomId = new mongodb.ObjectID() ,
			userAccess = {} ;

		userAccess[ randomId ] = 'read' ;	// Random unexistant ID

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all' ,
			userAccess: userAccess
		} ) ;

		await blog.save() ;

		var response = await app.get( '/Blogs/' + blog.getId() + '/.title' , { performer: performer } ) ;
		expect( response.output.data ).to.be( 'My wonderful life' ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/.userAccess.' + randomId , { performer: performer } ) ;
		expect( response.output.data ).to.equal( { traverse: true , read: ['id','content'] , exec: ['id','content'] , query: true } ) ;
	} ) ;

	it( "POST then GET" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post(
			'/Blogs' ,
			{
				title: 'My wonderful life posted!!!' ,
				description: 'This is a supa blog! (posted!)' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		var id = response.output.data.id.toString() ;
		expect( id ).to.be.a( 'string' ) ;
		expect( id ).to.have.length.of( 24 ) ;

		response = await app.get( '/Blogs/' + id , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life posted!!!' ,
			description: 'This is a supa blog! (posted!)' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "PUT then GET" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life 2!!!' ,
			description: 'This is a supa blog! (x2)' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "PUT, then PUT (overwrite), then GET" , async () => {
		var { app , performer } = await commonApp() ;

		var response = app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 3!!!' ,
				description: 'This is a supa blog! (x3)' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 3!!!' ,
				description: 'This is a supa blog! Now overwritten!' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;

		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life 3!!!' ,
			description: 'This is a supa blog! Now overwritten!' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "PATCH on an unexisting item" , async () => {
		var { app , performer } = await commonApp() ;

		await expect( () => app.patch( '/Blogs/111111111111111111111111' , { description: 'Oh yeah!' } , null , { performer: performer } ) )
			.to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
	} ) ;

	it( "PUT, then PATCH, then GET (featuring embedded data)" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 3!!!' ,
				description: 'This is a supa blog! (x3)' ,
				embedded: { a: 'a' , b: 'b' } ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				description: 'This is a supa blog! Now patched!' ,
				"embedded.a": 'A' ,
				parent: "should not overwrite" ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life 3!!!' ,
			description: 'This is a supa blog! Now patched!' ,
			embedded: { a: 'A' , b: 'b' } ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "PUT, then PATCH on a property, then GET (featuring embedded data)" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 3!!!' ,
				description: 'This is a supa blog! (x3)' ,
				embedded: { a: 'a' , b: 'b' } ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8/.embedded' , { a: 'omg' } , null , { performer: performer } ) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;

		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life 3!!!' ,
			description: 'This is a supa blog! (x3)' ,
			embedded: { a: 'omg' , b: 'b' } ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "PUT, then PUT (overwrite) on a property, then GET" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{			title: 'My wonderful life 3!!!' ,
				description: 'This is a supa blog! (x3)' ,
				publicAccess: 'all' } ,
			null ,
			{ performer: performer }
		) ;

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/.title' , "Change dat title." , null , { performer: performer } ) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;

		expect( response.output.data ).to.partially.equal( {
			title: 'Change dat title.' ,
			description: 'This is a supa blog! (x3)' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "DELETE on an unexisting item" , async () => {
		var { app , performer } = await commonApp() ;
		await expect( () => app.delete( '/Blogs/111111111111111111111111' , { performer: performer } ) ).to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
	} ) ;

	it( "PUT, then DELETE, then GET" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				publicAccess: 'all' } ,
			null ,
			{ performer: performer }
		) ;

		response = await app.delete( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;

		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ).to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
	} ) ;

	it( "DELETE on a property of an object" ) ;
	it( "DELETE should recursively delete all children [NOT CODED ATM]" ) ;
} ) ;



describe( "Basic queries of top-level collections" , () => {

	it( "GET on an empty collection" , async () => {
		var { app , performer } = await commonApp() ;
		var response = await app.get( '/Blogs' , { performer: performer } ) ;
		expect( response.output.data ).to.equal( [] ) ;
	} ) ;

	it( "GET on a collection with items" , async () => {
		var { app , performer } = await commonApp() ;

		var blog1 = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog1.save() ;

		var blog2 = app.root.children.blogs.collection.createDocument( {
			title: 'YAB' ,
			description: 'Yet Another Blog' ,
			publicAccess: 'all'
		} ) ;

		await blog2.save() ;

		var response = await app.get( '/Blogs' , { performer: performer } ) ;
		expect( response.output.data ).to.equal( [
			{
				title: 'My wonderful life' ,
				description: 'This is a supa blog!' ,
				_id: blog1.getId() ,
				//embedded: undefined,
				parent: { id: '/' , collection: 'root' } ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
				} ,
				slugId: response.output.data[ 0 ].slugId		// cannot be predicted
			} ,
			{
				title: 'YAB' ,
				description: 'Yet Another Blog' ,
				_id: blog2.getId() ,
				//embedded: undefined,
				parent: { id: '/' , collection: 'root' } ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
				} ,
				slugId: response.output.data[ 1 ].slugId		// cannot be predicted
			}
		] ) ;
	} ) ;
} ) ;



describe( "Query: skip, limit, sort" , () => {

	it( "GET on a collection with items, with special query: skip, limit and sort" , async () => {
		var { app , performer } = await commonApp() ;

		var blog1 = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog1.save() ;

		var blog2 = app.root.children.blogs.collection.createDocument( {
			title: 'YAB' ,
			description: 'Yet Another Blog' ,
			publicAccess: 'all'
		} ) ;

		await blog2.save() ;

		var blog3 = app.root.children.blogs.collection.createDocument( {
			title: 'Third' ,
			description: 'The Third' ,
			publicAccess: 'all'
		} ) ;

		await blog3.save() ;

		var response = await app.get( '/Blogs' , { performer: performer , input: { query: { limit: 2 } } } ) ;
		expect( response.output.data ).to.equal( [
			{
				title: 'My wonderful life' ,
				description: 'This is a supa blog!' ,
				_id: blog1.getId() ,
				//embedded: undefined,
				parent: { id: '/' , collection: 'root' } ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
				} ,
				slugId: response.output.data[ 0 ].slugId		// cannot be predicted
			} ,
			{
				title: 'YAB' ,
				description: 'Yet Another Blog' ,
				_id: blog2.getId() ,
				//embedded: undefined,
				parent: { id: '/' , collection: 'root' } ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
				} ,
				slugId: response.output.data[ 1 ].slugId		// cannot be predicted
			}
		] ) ;

		response = await app.get( '/Blogs' , { performer: performer , input: { query: { skip: 1 } } } ) ;
		expect( response.output.data ).to.equal( [
			{
				title: 'YAB' ,
				description: 'Yet Another Blog' ,
				_id: blog2.getId() ,
				//embedded: undefined,
				parent: { id: '/' , collection: 'root' } ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
				} ,
				slugId: response.output.data[ 0 ].slugId		// cannot be predicted
			} ,
			{
				title: 'Third' ,
				description: 'The Third' ,
				_id: blog3.getId() ,
				//embedded: undefined,
				parent: { id: '/' , collection: 'root' } ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
				} ,
				slugId: response.output.data[ 1 ].slugId		// cannot be predicted
			}
		] ) ;


		// ascendant sorting
		var expected = [
			{
				title: 'My wonderful life' ,
				description: 'This is a supa blog!' ,
				_id: blog1.getId() ,
				//embedded: undefined,
				parent: { id: '/' , collection: 'root' } ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
				} ,
				slugId: blog1.slugId
			} ,
			{
				title: 'Third' ,
				description: 'The Third' ,
				_id: blog3.getId() ,
				//embedded: undefined,
				parent: { id: '/' , collection: 'root' } ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
				} ,
				slugId: blog3.slugId
			}
		] ;

		response = await app.get( '/Blogs' , { performer: performer , input: { query: { limit: 2 , sort: { title: 1 } } } } ) ;
		expect( response.output.data ).to.equal( expected ) ;

		response = await app.get( '/Blogs' , { performer: performer , input: { query: { limit: 2 , sort: { title: '1' } } } } ) ;
		expect( response.output.data ).to.equal( expected ) ;

		response = await app.get( '/Blogs' , { performer: performer , input: { query: { limit: 2 , sort: { title: 'asc' } } } } ) ;
		expect( response.output.data ).to.equal( expected ) ;

		response = await app.get( '/Blogs' , { performer: performer , input: { query: { limit: 2 , sort: { title: 'ascendant' } } } } ) ;
		expect( response.output.data ).to.equal( expected ) ;


		// descendant sorting
		var expected = [
			{
				title: 'YAB' ,
				description: 'Yet Another Blog' ,
				_id: blog2.getId() ,
				//embedded: undefined,
				parent: { id: '/' , collection: 'root' } ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
				} ,
				slugId: blog2.slugId
			} ,
			{
				title: 'Third' ,
				description: 'The Third' ,
				_id: blog3.getId() ,
				//embedded: undefined,
				parent: { id: '/' , collection: 'root' } ,
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: {
					traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
				} ,
				slugId: blog3.slugId
			}
		] ;

		response = await app.get( '/Blogs' , { performer: performer , input: { query: { limit: 2 , sort: { title: -1 } } } } ) ;
		expect( response.output.data ).to.equal( expected ) ;

		response = await app.get( '/Blogs' , { performer: performer , input: { query: { limit: 2 , sort: { title: '-1' } } } } ) ;
		expect( response.output.data ).to.equal( expected ) ;
		
		response = await app.get( '/Blogs' , { performer: performer , input: { query: { limit: 2 , sort: { title: 'desc' } } } } ) ;
		expect( response.output.data ).to.equal( expected ) ;

		response = await app.get( '/Blogs' , { performer: performer , input: { query: { limit: 2 , sort: { title: 'descendant' } } } } ) ;
		expect( response.output.data ).to.equal( expected ) ;
	} ) ;
} ) ;



describe( "Query: filters and text search" , () => {
	var app , performer , blog , post1 , post2 , post3 , expectedPost1 , expectedPost2 , expectedPost3 ;

	beforeEach( async () => {
		( { app , performer } = await commonApp() ) ;

		blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;

		post1 = await app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'First post' ,
			content: 'First post content.' ,
			date: new Date( '2018-12-12' ) ,
			likes: 19 ,
			emotes: ['happy','thumb-up'] ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await post1.save() ;

		post2 = await app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'Second post' ,
			content: 'Second post content.' ,
			date: new Date( '2018-12-14' ) ,
			likes: 28 ,
			emotes: ['sad'] ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await post2.save() ;

		post3 = await app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'Third post' ,
			content: 'Third post content.' ,
			date: new Date( '2018-12-16' ) ,
			likes: 7 ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await post3.save() ;
		
		expectedPost1 = {
			_id: post1.getId() ,
			slugId: post1.slugId ,
			title: 'First post' ,
			content: 'First post content.' ,
			date: post1.date ,
			likes: 19 ,
			emotes: ['happy','thumb-up'] ,
			parent: { id: blog.getId() , collection: 'blogs' } ,
			userAccess: {} ,
			groupAccess: {} ,
			publicAccess: {
				traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
			}
		} ;
		
		expectedPost2 = {
			_id: post2.getId() ,
			slugId: post2.slugId ,
			title: 'Second post' ,
			content: 'Second post content.' ,
			date: post2.date ,
			likes: 28 ,
			emotes: ['sad'] ,
			parent: { id: blog.getId() , collection: 'blogs' } ,
			userAccess: {} ,
			groupAccess: {} ,
			publicAccess: {
				traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
			}
		} ;
		
		expectedPost3 = {
			_id: post3.getId() ,
			slugId: post3.slugId ,
			title: 'Third post' ,
			content: 'Third post content.' ,
			date: post3.date ,
			likes: 7 ,
			parent: { id: blog.getId() , collection: 'blogs' } ,
			userAccess: {} ,
			groupAccess: {} ,
			publicAccess: {
				traverse: true , read: true , write: true , delete: true , overwrite: true , exec: true , query: true , create: true
			} 
		} ;
	} ) ;

	it( "GET on a collection with a filter using standard match on scalar fields" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { title: 'Third post' } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost3 ] ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: 19 } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 ] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $eq perfect match" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $eq: 19 } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 ] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using standard match on array fields should match when the array has that argument as element" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { emotes: 'happy' } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 ] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $eq perfect match on array fields should throw if the argument is not an array" , async () => {
		await expect( () => app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { emotes: { $eq: 'happy' } } } } } ) )
			.to.reject.with( ErrorStatus , { type: 'badRequest' } ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $eq perfect match on array fields should match when the argument is the full array" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { emotes: { $eq: ['happy','thumb-up'] } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 ] ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { emotes: { $eq: ['happy'] } } } } } ) ;
		expect( response.output.data ).to.equal( [] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $ne match" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $ne: 19 } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost2 , expectedPost3 ] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $gt match" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $gt: 19 } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost2 ] ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $gt: 40 } } } } } ) ;
		expect( response.output.data ).to.equal( [] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $gte match" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $gte: 19 } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 , expectedPost2 ] ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $gte: 40 } } } } } ) ;
		expect( response.output.data ).to.equal( [] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $lt match" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $lt: 19 } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost3 ] ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $lt: 4 } } } } } ) ;
		expect( response.output.data ).to.equal( [] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $lte match" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $lte: 19 } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 , expectedPost3 ] ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $lte: 4 } } } } } ) ;
		expect( response.output.data ).to.equal( [] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $in match on _id" , async () => {
		// Without sanitizing
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { _id: { $in: [ post1.getId() , post3.getId() ] } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 , expectedPost3 ] ) ;

		// With sanitizing needed
		response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { _id: { $in: [ post1.getKey() , post3.getKey() ] } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 , expectedPost3 ] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $in match on scalar fields should match when the value is one of the element of the array argument" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $in: [10,11,12,19,20] } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 ] ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $in: [10,11,12,20] } } } } } ) ;
		expect( response.output.data ).to.equal( [] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $in match on array fields should match when the array has one of the element of the array argument" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { emotes: { $in: ['bob','thumb-up'] } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 ] ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { emotes: { $in: ['bob','thumb-down'] } } } } } ) ;
		expect( response.output.data ).to.equal( [] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $nin match on scalar fields should NOT match when the value is one of the element of the array argument" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $nin: [10,11,12,19,20] } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost2 , expectedPost3 ] ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { likes: { $nin: [10,11,12,20] } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 , expectedPost2 , expectedPost3 ] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using $nin match on array fields should NOT match when the array has one of the element of the array argument" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { emotes: { $nin: ['bob','thumb-up'] } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost2 , expectedPost3 ] ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { emotes: { $nin: ['bob','thumb-down'] } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost1 , expectedPost2 , expectedPost3 ] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using standard match with a Date object" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { date: post3.date } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost3 ] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using standard match with a date string, the string should be sanitized to a Date instance" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { date: '2018-12-16' } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost3 ] ) ;
	} ) ;
	
	it( "GET on a collection with a filter using 'greater than or equal' to a Date object" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { filter: { date: { $gte: post2.date } } } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost2 , expectedPost3 ] ) ;
	} ) ;
	
	it( "GET on a collection filtering on a text search" , async () => {
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { search: 'second' } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost2 ] ) ;

		// search
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer , input: { query: { search: 'content' } } } ) ;
		expect( response.output.data ).to.equal( [ expectedPost3 , expectedPost2 , expectedPost1 ] ) ;
	} ) ;
	
	it( "indexed and unindexed queries with the 'unindexedQueries' collection option" ) ;
} ) ;



describe( "Advanced PATCH commands" , () => {

	// Patches are using doormen.applyPatch() behind the scene
	
	it( "PATCH and $delete/$unset command" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life!!!' ,
				description: 'This is a supa blog!' ,
				embedded: { a: 'a' , b: 'b' , array: [1,2,3] } ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				"embedded.a": { $unset: 'A' } ,
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life!!!' ,
			description: 'This is a supa blog!' ,
			embedded: { b: 'b' , array: [1,2,3] } ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "PATCH and $push command" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life!!!' ,
				description: 'This is a supa blog!' ,
				embedded: { a: 'a' , b: 'b' , array: [1,2,3] } ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				"embedded.array": { $push: 18 } ,
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life!!!' ,
			description: 'This is a supa blog!' ,
			embedded: { a: 'a' , b: 'b' , array: [1,2,3,18] } ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "PATCH and uniqness behavior of multi-link with regular patches and $push patches" , async () => {
		var { app , performer } = await commonApp() ;

		var response , groupId , userId1 , userId2 , userId3 , userId4 , batch ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId1 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Jack" ,
				lastName: "Wallace" ,
				email: "jack.wallace@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId2 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fischer" ,
				email: "bobby.fischer@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId3 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Not In" ,
				lastName: "Dagroup" ,
				email: "notindagroup@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId4 = response.output.data.id ;

		response = await app.post( '/Groups' ,
			{
				name: "The Group" ,
				// Check uniqness when posting
				users: [ userId1 , userId2 , userId1 , userId3 ] ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;

		groupId = response.output.data.id ;
		
		response = await app.get( '/Groups/' + groupId , { performer: performer } ) ;
		expect( response.output.data.users ).to.equal( [ { _id: userId1 } , { _id: userId2 } , { _id: userId3 } ] ) ;

		// Create a patch that would push a duplicated link, and verify it does nothing
		response = await app.patch( '/Groups/' + groupId , { users: { $push: userId1 } } , null , { performer: performer } ) ;
		response = await app.get( '/Groups/' + groupId , { performer: performer } ) ;
		expect( response.output.data.users ).to.equal( [ { _id: userId1 } , { _id: userId2 } , { _id: userId3 } ] ) ;

		// Create a patch that push a new link
		response = await app.patch( '/Groups/' + groupId , { users: { $push: userId4 } } , null , { performer: performer } ) ;
		response = await app.get( '/Groups/' + groupId , { performer: performer } ) ;
		expect( response.output.data.users ).to.equal( [ { _id: userId1 } , { _id: userId2 } , { _id: userId3 } , { _id: userId4 } ] ) ;

		// Create a patch replace the whole multi-link array
		response = await app.patch( '/Groups/' + groupId , { users: [ userId1 , userId1 , userId4 , userId1 , userId4 ] } , null , { performer: performer } ) ;
		response = await app.get( '/Groups/' + groupId , { performer: performer } ) ;
		expect( response.output.data.users ).to.equal( [ { _id: userId1 } , { _id: userId4 } ] ) ;

		// Create a patch replace the whole multi-link array by an empty one
		response = await app.patch( '/Groups/' + groupId , { users: [] } , null , { performer: performer } ) ;
		response = await app.get( '/Groups/' + groupId , { performer: performer } ) ;
		expect( response.output.data.users ).to.equal( [] ) ;
	} ) ;
} ) ;



describe( "Built-in collection method: SCHEMA" , () => {

	it( "should get the schema of the collection" , async () => {
		var { app , performer } = await commonApp() ;
		var response = await app.get( '/Blogs/SCHEMA' , { performer: performer } ) ;
		expect( response.output.data ).to.equal( app.collectionNodes.blogs.schema ) ;
	} ) ;

	it( "should get the schema of the object" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;

		var response = await app.get( '/Blogs/' + blog.getId() + '/SCHEMA' , { performer: performer } ) ;
		expect( response.output.data ).to.equal( app.collectionNodes.blogs.schema ) ;
	} ) ;
} ) ;



describe( "Queries of nested object" , () => {

	it( "GET on an unexisting nested item" , async () => {
		var { app , performer } = await commonApp() ;
		await expect( () => app.get( '/Blogs/111111111111111111111111/Posts/111111111111111111111111' , { performer: performer } ) )
			.to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
	} ) ;

	it( "GET on a regular nested item" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = await app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;

		var post = await app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'My first post!' ,
			content: 'Blah blah blah.' ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await post.save() ;

		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + post.getId() , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My first post!' ,
			content: 'Blah blah blah.'
		} ) ;
	} ) ;

	it( "GET on an existed nested item with bad ancestry chain" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;

		var anotherBlog = app.root.children.blogs.collection.createDocument( {
			title: 'Another blog' ,
			description: 'Oh yeah' ,
			publicAccess: 'all'
		} ) ;

		await anotherBlog.save() ;

		var post = app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'My second post!' ,
			content: 'Blah blah blah.' ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await post.save() ;

		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + post.getId() , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My second post!' ,
			content: 'Blah blah blah.'
		} ) ;

		await expect( () => app.get( '/Blogs/' + anotherBlog.getId() + '/Posts/' + post.getId() , { performer: performer } ) )
			.to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
	} ) ;

	it( "GET on a regular nested² item" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;

		var post = app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'My first post!' ,
			content: 'Blah blah blah.' ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await post.save() ;

		var comment = app.root.children.blogs.children.posts.children.comments.collection.createDocument( {
			title: 'nope!' ,
			content: 'First!' ,
			parent: { collection: 'posts' , id: post.getId() } ,
			publicAccess: 'all'
		} ) ;

		await comment.save() ;

		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + post.getId() + '/Comments/' + comment.getId() , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( { title: 'nope!' , content: 'First!' } ) ;
	} ) ;

	it( "GET on a regular nested² item with bad ancestry chain" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;

		var anotherBlog = app.root.children.blogs.collection.createDocument( {
			title: 'Another blog' ,
			description: 'Oh yeah' ,
			publicAccess: 'all'
		} ) ;

		await anotherBlog.save() ;

		var post = app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'My first post!' ,
			content: 'Blah blah blah.' ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await post.save() ;

		var anotherPost = app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'My second post!' ,
			content: 'Blih blih blih.' ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await anotherPost.save() ;

		var comment = app.root.children.blogs.children.posts.children.comments.collection.createDocument( {
			title: 'nope!' ,
			content: 'First!' ,
			parent: { collection: 'posts' , id: post.getId() } ,
			publicAccess: 'all'
		} ) ;

		await comment.save() ;

		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + post.getId() + '/Comments/' + comment.getId() , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( { title: 'nope!' , content: 'First!' } ) ;

		await expect( () => app.get( '/Blogs/' + anotherBlog.getId() + '/Posts/' + post.getId() + '/Comments/' + comment.getId() , { performer: performer } ) )
			.to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + anotherPost.getId() , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( { title: 'My second post!' , content: 'Blih blih blih.' } ) ;

		await expect( () => app.get( '/Blogs/' + blog.getId() + '/Posts/' + anotherPost.getId() + '/Comments/' + comment.getId() , { performer: performer } ) )
			.to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
	} ) ;

	it( "GET a nested collection" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;

		var anotherBlog = app.root.children.blogs.collection.createDocument( {
			title: 'Another blog' ,
			description: 'Oh yeah' ,
			publicAccess: 'all'
		} ) ;

		await anotherBlog.save() ;

		var post1 = app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'My first post!' ,
			content: 'Blah blah blah.' ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await post1.save() ;

		var post2 = app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'My second post!' ,
			content: 'Hi ho!' ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await post2.save() ;

		var postAlt = app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'My alternate post!' ,
			content: 'It does not belong to the same blog!' ,
			parent: { collection: 'blogs' , id: anotherBlog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await postAlt.save() ;

		var post3 = app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'My third post!' ,
			content: 'Yay!' ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await post3.save() ;

		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts' , { performer: performer } ) ;

		expect( response.output.data ).to.have.length( 3 ) ;

		expect( response.output.data ).to.partially.equal( [
			{
				title: 'My first post!' ,
				content: 'Blah blah blah.' ,
				parent: { collection: 'blogs' }
			} ,
			{
				title: 'My second post!' ,
				content: 'Hi ho!' ,
				parent: { collection: 'blogs' }
			} ,
			{
				title: 'My third post!' ,
				content: 'Yay!' ,
				parent: { collection: 'blogs' }
			}
		] ) ;

		// MongoID and expect() do not coop well together, we have to check those properties one by one...
		expect( response.output.data[ 0 ].parent.id.toString() ).to.be( blog.getId().toString() ) ;
		expect( response.output.data[ 1 ].parent.id.toString() ).to.be( blog.getId().toString() ) ;
		expect( response.output.data[ 2 ].parent.id.toString() ).to.be( blog.getId().toString() ) ;
	} ) ;

	it( "POST on nested object should set the parent property correctly" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;

		var response = await app.post( '/Blogs/' + blog.getId() + '/Posts' ,
			{
				title: 'My first post!!!' ,
				content: 'Blah blah blah...' ,
				parent: 'should not overwrite' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		var postId = response.output.data.id ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + postId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My first post!!!' ,
			content: 'Blah blah blah...' ,
			parent: { collection: 'blogs' }
		} ) ;
		expect( response.output.data.parent.id.toString() ).to.be( blog.getId().toString() ) ;
	} ) ;

	it( "PUT on nested object should set the parent property correctly, same for PUT in overwrite mode" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;

		var postId = '5437f8f6c41d00910ec9a5d8' ;
		var response = await app.put( '/Blogs/' + blog.getId() + '/Posts/' + postId ,
			{
				title: 'My first post!!!' ,
				content: 'Blah blah blah...' ,
				parent: 'should not overwrite' ,
				publicAccess: 'all'
			} ,
			null , { performer: performer }
		) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + postId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My first post!!!' ,
			content: 'Blah blah blah...' ,
			parent: { collection: 'blogs' }
		} ) ;
		expect( response.output.data.parent.id.toString() ).to.be( blog.getId().toString() ) ;

		response = await app.put( '/Blogs/' + blog.getId() + '/Posts/' + postId ,
			{
				title: 'My first post???' ,
				content: 'Blah?' ,
				parent: 'should not overwrite' ,
				publicAccess: 'all'
			} ,
			null , { performer: performer }
		) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + postId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My first post???' ,
			content: 'Blah?' ,
			parent: { collection: 'blogs' }
		} ) ;
		expect( response.output.data.parent.id.toString() ).to.be( blog.getId().toString() ) ;
	} ) ;

	it( "PUT on an existed, nested item, with bad ancestry chain" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;

		var anotherBlog = app.root.children.blogs.collection.createDocument( {
			title: 'Another blog' ,
			description: 'Oh yeah' ,
			publicAccess: 'all'
		} ) ;

		await anotherBlog.save() ;

		var post = app.root.children.blogs.children.posts.collection.createDocument( {
			title: 'My second post!' ,
			content: 'Blah blah blah.' ,
			parent: { collection: 'blogs' , id: blog.getId() } ,
			publicAccess: 'all'
		} ) ;

		await post.save() ;

		// Ancestry mismatch
		await expect( () => app.put( '/Blogs/' + anotherBlog.getId() + '/Posts/' + post.getId() ,
			{
				title: 'My edited post!' ,
				content: 'Plop.' ,
				publicAccess: 'all'
			} ,
			null , { performer: performer }
		) ).to.reject( ErrorStatus , { type: 'badRequest' , httpStatus: 400 , message: 'Ambigous PUT request: this ID exists but is the child of another parent.' } ) ;

		// Should not be edited
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + post.getId() , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My second post!' ,
			content: 'Blah blah blah.' ,
			parent: { collection: 'blogs' }
		} ) ;
		expect( response.output.data.parent.id.toString() ).to.be( blog.getId().toString() ) ;
	} ) ;
} ) ;



describe( "Links" , () => {

	it( "GET on a link" , async () => {
		var { app , performer } = await commonApp() ;

		var response , godfatherId , userId ;

		response = await app.post( '/Users' ,
			{
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		godfatherId = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all" ,
				godfather: godfatherId
			} ,
			null ,
			{ performer: performer }
		) ;
		userId = response.output.data.id ;

		response = await app.get( '/Users/' + userId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: 'Joe' ,
			lastName: 'Doe' ,
			slugId: 'joe-doe' ,
			email: 'joe.doe@gmail.com' ,
			parent: { id: '/' , collection: 'root' } ,
			godfather: { _id: godfatherId }
		} ) ;

		response = await app.get( '/Users/' + userId + '/~godfather' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: 'THE' ,
			lastName: 'GODFATHER' ,
			slugId: 'the-godfather' ,
			email: 'godfather@gmail.com' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "GET documents filtered on a link property" , async () => {
		var { app , performer } = await commonApp() ;

		var response , godfatherId , userId ;

		response = await app.post( '/Users' ,
			{
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		godfatherId = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all" ,
				godfather: godfatherId
			} ,
			null ,
			{ performer: performer }
		) ;
		userId = response.output.data.id ;

		response = await app.get( '/Users/' , { performer: performer , input: { query: { filter: { godfather: godfatherId } } } } ) ;
		expect( response.output.data ).to.partially.equal( [ {
			firstName: 'Joe' ,
			lastName: 'Doe' ,
			slugId: 'joe-doe' ,
			email: 'joe.doe@gmail.com' ,
			parent: { id: '/' , collection: 'root' } ,
			godfather: { _id: godfatherId }
		} ] ) ;
	} ) ;
	
	it( "GET through a link" ) ;

	it( "PUT (create) on a link" , async () => {
		var { app , performer } = await commonApp() ;

		var response , userId , godfatherId ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId = response.output.data.id ;

		response = await app.put( '/Users/' + userId + '/~godfather' ,
			{
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		godfatherId = response.output.data.id ;

		// Get it using a link
		response = await app.get( '/Users/' + userId + '/~godfather' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: 'THE' ,
			lastName: 'GODFATHER' ,
			slugId: 'the-godfather' ,
			email: 'godfather@gmail.com' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		// Direct get
		response = await app.get( '/Users/' + godfatherId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: 'THE' ,
			lastName: 'GODFATHER' ,
			slugId: 'the-godfather' ,
			email: 'godfather@gmail.com' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "PUT (overwrite) on a link" , async () => {
		var { app , performer } = await commonApp() ;

		var response , userId , godfatherId , godfatherId2 ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId = response.output.data.id ;

		response = await app.put( '/Users/' + userId + '/~godfather' ,
			{
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		godfatherId = response.output.data.id ;

		// Check the godfather
		response = await app.get( '/Users/' + userId + '/~godfather' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: 'THE' ,
			lastName: 'GODFATHER' ,
			slugId: 'the-godfather' ,
			email: 'godfather@gmail.com' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		// Overwrite with another godfather
		response = await app.put( '/Users/' + userId + '/~godfather' ,
			{
				firstName: "DAT" ,
				lastName: "GODFATHER!?" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		godfatherId2 = response.output.data.id ;

		// Check the godfather2
		response = await app.get( '/Users/' + userId + '/~godfather' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: 'DAT' ,
			lastName: 'GODFATHER!?' ,
			slugId: 'the-godfather' ,
			email: 'godfather@gmail.com' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
		expect( response.output.data._id.toString() ).to.be( godfatherId2.toString() ) ;
		expect( godfatherId.toString() ).to.be( godfatherId2.toString() ) ;
	} ) ;

	it( "PUT through a link" ) ;

	it( "PATCH on a link" , async () => {
		var { app , performer } = await commonApp() ;

		var response , userId , godfatherId ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId = response.output.data.id ;

		response = await app.put( '/Users/' + userId + '/~godfather' ,
			{
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		godfatherId = response.output.data.id ;

		response = await app.patch( '/Users/' + userId + '/~godfather' , { firstName: 'Da' } , null , { performer: performer } ) ;

		// Check that the godfather has been modified
		response = await app.get( '/Users/' + userId + '/~godfather' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: 'Da' ,
			lastName: 'GODFATHER' ,
			slugId: 'the-godfather' ,
			email: 'godfather@gmail.com' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "PATCH through a link" ) ;

	it( "DELETE on a link" , async () => {
		var { app , performer } = await commonApp() ;

		var response , userId , godfatherId ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId = response.output.data.id ;

		response = await app.put( '/Users/' + userId + '/~godfather' ,
			{
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		godfatherId = response.output.data.id ;

		// Just check it exists
		response = await app.get( '/Users/' + userId + '/~godfather' , { performer: performer } ) ;

		// Check that the user has the godfather
		response = await app.get( '/Users/' + userId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: "Joe" ,
			lastName: "Doe" ,
			email: "joe.doe@gmail.com" ,
			parent: { id: '/' , collection: 'root' } ,
			godfather: { _id: godfatherId }
		} ) ;

		// Delete the godfather now
		response = await app.delete( '/Users/' + userId + '/~godfather' , { performer: performer } ) ;

		await expect( () => app.get( '/Users/' + userId + '/~godfather' , { performer: performer } ) )
			.to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;

		await expect( () => app.get( '/Users/' + godfatherId , { performer: performer } ) )
			.to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;

		response = await app.get( '/Users/' + userId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: "Joe" ,
			lastName: "Doe" ,
			email: "joe.doe@gmail.com" ,
			parent: { id: '/' , collection: 'root' } ,
			godfather: null
		} ) ;
	} ) ;

	it( "DELETE through a link" ) ;

	it( "POST on a link should fail (it doesn't make sense)" , async () => {
		var { app , performer } = await commonApp() ;

		var response , userId , godfatherId ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId = response.output.data.id ;

		// POST when the link don't exist should be a 'not found'
		await expect( () => app.post( '/Users/' + userId + '/~godfather' ,
			{
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;

		response = await app.put( '/Users/' + userId + '/~godfather' ,
			{
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		godfatherId = response.output.data.id ;

		// POST when the link exist should be a 'bad request'
		await expect( () => app.post( '/Users/' + userId + '/~godfather' ,
			{
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( ErrorStatus , { type: 'badRequest' , httpStatus: 400 } ) ;
	} ) ;

	it( "POST through a link" ) ;

	it( "GET + populate links" , async () => {
		var { app , performer } = await commonApp() ;

		var response , fatherId , userId , godfatherId ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId = response.output.data.id ;

		response = await app.put( '/Users/' + userId + '/~father' ,
			{
				firstName: "Big Joe" ,
				lastName: "Doe" ,
				email: "big-joe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		fatherId = response.output.data.id ;

		response = await app.put( '/Users/' + userId + '/~godfather' ,
			{
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		godfatherId = response.output.data.id ;

		response = await app.get( '/Users/' + userId , { performer: performer , query: { populate: [ 'father' , 'godfather' ] } } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: "Joe" ,
			lastName: "Doe" ,
			email: "joe.doe@gmail.com" ,
			parent: { id: '/' , collection: 'root' } ,
			father: {
				_id: fatherId ,
				firstName: "Big Joe" ,
				lastName: "Doe" ,
				email: "big-joe@gmail.com"
			} ,
			godfather: {
				_id: godfatherId ,
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com"
			}
		} ) ;
	} ) ;

	it( "GET + populate broken/dead links should patch the link" , async () => {
		var { app , performer } = await commonApp() ;

		var response , fatherId , userId , godfatherId ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId = response.output.data.id ;

		response = await app.put( '/Users/' + userId + '/~father' ,
			{
				firstName: "Big Joe" ,
				lastName: "Doe" ,
				email: "big-joe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		fatherId = response.output.data.id ;

		response = await app.put( '/Users/' + userId + '/~godfather' ,
			{
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		godfatherId = response.output.data.id ;

		response = await app.get( '/Users/' + userId , { performer: performer , query: { populate: [ 'father' , 'godfather' ] } } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: "Joe" ,
			lastName: "Doe" ,
			email: "joe.doe@gmail.com" ,
			parent: { id: '/' , collection: 'root' } ,
			father: {
				_id: fatherId ,
				firstName: "Big Joe" ,
				lastName: "Doe" ,
				email: "big-joe@gmail.com"
			} ,
			godfather: {
				_id: godfatherId ,
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com"
			}
		} ) ;

		// Remove one link
		response = await app.delete( '/Users/' + fatherId , { performer: performer } ) ;
		response = await app.get( '/Users/' + userId , { performer: performer , query: { populate: [ 'father' , 'godfather' ] } } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: "Joe" ,
			lastName: "Doe" ,
			email: "joe.doe@gmail.com" ,
			parent: { id: '/' , collection: 'root' } ,
			father: null ,
			godfather: {
				_id: godfatherId ,
				firstName: "THE" ,
				lastName: "GODFATHER" ,
				email: "godfather@gmail.com"
			}
		} ) ;
		
		// Remove another link
		response = await app.delete( '/Users/' + godfatherId , { performer: performer } ) ;
		response = await app.get( '/Users/' + userId , { performer: performer , query: { populate: [ 'father' , 'godfather' ] } } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: "Joe" ,
			lastName: "Doe" ,
			email: "joe.doe@gmail.com" ,
			parent: { id: '/' , collection: 'root' } ,
			father: null ,
			godfather: null
		} ) ;

		// Test without 'populate' that they are removed
		response = await app.get( '/Users/' + userId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: "Joe" ,
			lastName: "Doe" ,
			email: "joe.doe@gmail.com" ,
			parent: { id: '/' , collection: 'root' } ,
			father: null ,
			godfather: null
		} ) ;
	} ) ;
} ) ;



describe( "Multi-links" , () => {

	it( "GET on and through a multi-link" , async () => {
		var { app , performer } = await commonApp() ;

		var response , groupId , userId1 , userId2 , userId3 , userId4 , batch ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId1 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Jack" ,
				lastName: "Wallace" ,
				email: "jack.wallace@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId2 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fischer" ,
				email: "bobby.fischer@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId3 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Not In" ,
				lastName: "Dagroup" ,
				email: "notindagroup@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId4 = response.output.data.id ;

		response = await app.post( '/Groups' ,
			{
				name: "The Group" ,
				users: [ userId1 , userId2 , userId3 ] ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;

		groupId = response.output.data.id ;

		response = await app.get( '/Groups/' + groupId + '/~~users' , { performer: performer } ) ;
		batch = response.output.data ;
		expect( batch ).to.have.length( 3 ) ;

		var has = {} ;
		has[ batch[ 0 ].firstName ] = true ;
		has[ batch[ 1 ].firstName ] = true ;
		has[ batch[ 2 ].firstName ] = true ;
		expect( has ).to.equal( { Bobby: true , Jack: true , Joe: true } ) ;

		response = await app.get( '/Groups/' + groupId + '/~~users/' + userId1 , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_id: userId1 ,
			firstName: 'Joe' ,
			lastName: 'Doe' ,
			email: 'joe.doe@gmail.com'
		} ) ;

		response = await app.get( '/Groups/' + groupId + '/~~users/' + userId2 , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_id: userId2 ,
			firstName: 'Jack' ,
			lastName: 'Wallace' ,
			email: 'jack.wallace@gmail.com'
		} ) ;

		response = await app.get( '/Groups/' + groupId + '/~~users/' + userId3 , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_id: userId3 ,
			firstName: 'Bobby' ,
			lastName: 'Fischer' ,
			email: 'bobby.fischer@gmail.com'
		} ) ;

		await expect( () => app.get( '/Groups/' + groupId + '/~~users/' + userId4 , { performer: performer } ) )
			.to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
	} ) ;

	it( "GET documents filtered on a multi-link property" , async () => {
		var { app , performer } = await commonApp() ;

		var response , groupId , userId1 , userId2 , userId3 , userId4 , batch ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId1 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Jack" ,
				lastName: "Wallace" ,
				email: "jack.wallace@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId2 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fischer" ,
				email: "bobby.fischer@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId3 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Not In" ,
				lastName: "Dagroup" ,
				email: "notindagroup@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId4 = response.output.data.id ;

		response = await app.post( '/Groups' ,
			{
				name: "The Group" ,
				users: [ userId1 , userId2 , userId3 ] ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;

		groupId = response.output.data.id ;

		// Without operator behavior
		response = await app.get( '/Groups/' , { performer: performer , input: { query: { filter: { users: userId1 } } } } ) ;
		expect( response.output.data ).to.partially.equal( [ {
			name: "The Group" ,
			users: [ { _id: userId1 } , { _id: userId2 } , { _id: userId3 } ]
		} ] ) ;

		// With the element-compatible operator $in
		response = await app.get( '/Groups/' , { performer: performer , input: { query: { filter: { users: { $in: userId1 } } } } } ) ;
		expect( response.output.data ).to.partially.equal( [ {
			name: "The Group" ,
			users: [ { _id: userId1 } , { _id: userId2 } , { _id: userId3 } ]
		} ] ) ;

		// With element-compatible operator $nin
		response = await app.get( '/Groups/' , { performer: performer , input: { query: { filter: { users: { $nin: userId1 } } } } } ) ;
		expect( response.output.data ).to.partially.equal( [] ) ;
		
		response = await app.get( '/Groups/' , { performer: performer , input: { query: { filter: { users: { $nin: userId4 } } } } } ) ;
		expect( response.output.data ).to.partially.equal( [ {
			name: "The Group" ,
			users: [ { _id: userId1 } , { _id: userId2 } , { _id: userId3 } ]
		} ] ) ;
	} ) ;

	it( "POST on a multi-link should create a new resource and add it to the current link's array" , async () => {
		var { app , performer } = await commonApp() ;

		var response , groupId , userId1 , userId2 , userId3 , userId4 , batch ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId1 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Not In" ,
				lastName: "Dagroup" ,
				email: "notindagroup@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId4 = response.output.data.id ;

		response = await app.post( '/Groups' ,
			{			name: "The Group" ,
				users: [ userId1 ] ,
				publicAccess: "all" } ,
			null ,
			{ performer: performer }
		) ;
		groupId = response.output.data.id ;

		response = await app.post( '/Groups/' + groupId + '/~~users' ,
			{
				firstName: "Jack" ,
				lastName: "Wallace" ,
				email: "jack.wallace@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId2 = response.output.data.id ;

		response = await app.post( '/Groups/' + groupId + '/~~users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fischer" ,
				email: "bobby.fischer@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId3 = response.output.data.id ;

		response = await app.get( '/Groups/' + groupId + '/~~users' , { performer: performer } ) ;
		batch = response.output.data ;

		var has = {} ;
		has[ batch[ 0 ].firstName ] = true ;
		has[ batch[ 1 ].firstName ] = true ;
		has[ batch[ 2 ].firstName ] = true ;
		expect( has ).to.equal( { Bobby: true , Jack: true , Joe: true } ) ;
	} ) ;

	it( "POST through a multi-link" ) ;
	it( "PUT through a multi-link" ) ;

	it( "PATCH through a multi-link" , async () => {
		var { app , performer } = await commonApp() ;

		var response , groupId , userId1 , userId2 , userId3 , userId4 , batch ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId1 = response.output.data.id ;


		response = await app.post( '/Users' ,
			{
				firstName: "Jack" ,
				lastName: "Wallace" ,
				email: "jack.wallace@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId2 = response.output.data.id ;

		response = await app.post( '/Groups' ,
			{			name: "The Group" ,
				users: [ userId1 , userId2 ] ,
				publicAccess: "all" } ,
			null ,
			{ performer: performer }
		) ;
		groupId = response.output.data.id ;

		response = await app.patch( '/Groups/' + groupId + '/~~users/' + userId1 ,
			{			firstName: "Joey" ,
				email: "joey.doe@gmail.com" } ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Groups/' + groupId + '/~~users/' + userId1 , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_id: userId1 ,
			firstName: 'Joey' ,
			email: 'joey.doe@gmail.com'
		} ) ;

		response = await app.get( '/Users/' + userId1 , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_id: userId1 ,
			firstName: 'Joey' ,
			email: 'joey.doe@gmail.com'
		} ) ;
	} ) ;

	it( "DELETE through a multi-link should remove the targeted link" , async () => {
		var { app , performer } = await commonApp() ;

		var response , groupId , userId1 , userId2 , userId3 , userId4 , batch ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId1 = response.output.data.id ;


		response = await app.post( '/Users' ,
			{
				firstName: "Jack" ,
				lastName: "Wallace" ,
				email: "jack.wallace@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId2 = response.output.data.id ;

		response = await app.post( '/Groups' ,
			{			name: "The Group" ,
				users: [ userId1 , userId2 ] ,
				publicAccess: "all" } ,
			null ,
			{ performer: performer }
		) ;
		groupId = response.output.data.id ;

		response = await app.get( '/Groups/' + groupId + '/~~users' , { performer: performer } ) ;
		batch = response.output.data ;
		expect( batch ).to.have.length( 2 ) ;
		expect( batch ).to.partially.equal( [
			{
				_id: userId1 ,
				firstName: 'Joe' ,
				lastName: 'Doe'
			} ,
			{
				_id: userId2 ,
				firstName: 'Jack' ,
				lastName: 'Wallace'
			}
		] ) ;

		response = await app.delete( '/Groups/' + groupId + '/~~users/' + userId1 , { performer: performer } ) ;

		await expect( () => app.get( '/Groups/' + groupId + '/~~users/' + userId1 , { performer: performer } ) )
			.to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;

		response = await app.get( '/Groups/' + groupId + '/~~users' , { performer: performer } ) ;
		batch = response.output.data ;
		expect( batch ).to.have.length( 1 ) ;
		expect( batch ).to.partially.equal( [ {
			_id: userId2 ,
			firstName: 'Jack' ,
			lastName: 'Wallace'
		} ] ) ;
	} ) ;

	it( "GET + populate on a multi-link" , async () => {
		var { app , performer } = await commonApp() ;

		var response , groupId , userId1 , userId2 , userId3 , userId4 , batch ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId1 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Jack" ,
				lastName: "Wallace" ,
				email: "jack.wallace@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId2 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fischer" ,
				email: "bobby.fischer@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId3 = response.output.data.id ;

		response = await app.post( '/Groups' ,
			{
				name: "The Group" ,
				users: [ userId1 , userId2 , userId3 ] ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;

		groupId = response.output.data.id ;

		response = await app.get( '/Groups/' + groupId , { performer: performer , query: { populate: [ 'users' ] } } ) ;
		expect( response.output.data ).to.partially.equal( {
			name: "The Group" ,
			users: [
				{
					firstName: "Joe" ,
					lastName: "Doe" ,
					email: "joe.doe@gmail.com"
				} ,
				{
					firstName: "Jack" ,
					lastName: "Wallace" ,
					email: "jack.wallace@gmail.com"
				} ,
				{
					firstName: "Bobby" ,
					lastName: "Fischer" ,
					email: "bobby.fischer@gmail.com"
				}
			]
		} ) ;
	} ) ;

	it( "GET + populate broken/dead links inside of multi-links should patch the link" , async () => {
		var { app , performer } = await commonApp() ;

		var response , groupId , userId1 , userId2 , userId3 , userId4 , batch ;

		response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId1 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Jack" ,
				lastName: "Wallace" ,
				email: "jack.wallace@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId2 = response.output.data.id ;

		response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fischer" ,
				email: "bobby.fischer@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		userId3 = response.output.data.id ;

		response = await app.post( '/Groups' ,
			{
				name: "The Group" ,
				users: [ userId1 , userId2 , userId3 ] ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;

		groupId = response.output.data.id ;

		response = await app.get( '/Groups/' + groupId , { performer: performer , query: { populate: [ 'users' ] } } ) ;
		expect( response.output.data ).to.partially.equal( {
			name: "The Group" ,
			users: [
				{
					firstName: "Joe" ,
					lastName: "Doe" ,
					email: "joe.doe@gmail.com"
				} ,
				{
					firstName: "Jack" ,
					lastName: "Wallace" ,
					email: "jack.wallace@gmail.com"
				} ,
				{
					firstName: "Bobby" ,
					lastName: "Fischer" ,
					email: "bobby.fischer@gmail.com"
				}
			]
		} ) ;
		
		response = await app.delete( '/Users/' + userId1 , { performer: performer } ) ;

		response = await app.get( '/Groups/' + groupId , { performer: performer , query: { populate: [ 'users' ] } } ) ;
		expect( response.output.data ).to.partially.equal( {
			name: "The Group" ,
			users: [
				{
					firstName: "Jack" ,
					lastName: "Wallace" ,
					email: "jack.wallace@gmail.com"
				} ,
				{
					firstName: "Bobby" ,
					lastName: "Fischer" ,
					email: "bobby.fischer@gmail.com"
				}
			]
		} ) ;
		
	} ) ;
} ) ;



describe( "Users" , () => {

	it( "GET on an unexisting user" ) ;

	it( "GET on a regular user" ) ;

	it( "POST then GET" ) ;

	it( "PUT then GET" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Users/5437f846e41d0e910ec9a5d8' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw"
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Users/5437f846e41d0e910ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: 'Joe' ,
			lastName: 'Doe' ,
			slugId: 'joe-doe' ,
			email: 'joe.doe@gmail.com' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "PUT, then PUT (overwrite), then GET" ) ;

	it( "PATCH on an unexisting user" ) ;

	it( "PUT, then PATCH, then GET" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Users/5437f846e41d0e910ec9a5d8' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Users/5437f846e41d0e910ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: 'Joe' ,
			lastName: 'Doe' ,
			slugId: 'joe-doe' ,
			email: 'joe.doe@gmail.com' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		expect( response.output.data.password ).to.be.an( 'object' ) ;
		expect( response.output.data.password.algo ).to.be( 'sha512' ) ;
		expect( response.output.data.password.salt ).to.be.a( 'string' ) ;
		expect( response.output.data.password.hash ).to.be.a( 'string' ) ;
		// check the password
		expect( hash.password( "pw" , response.output.data.password.salt , response.output.data.password.algo ) ).to.be( response.output.data.password.hash ) ;

		response = await app.patch( '/Users/5437f846e41d0e910ec9a5d8' ,
			{
				firstName: "Joey" ,
				lastName: "Doe" ,
				email: "joey.doe@gmail.com" ,
				password: "pw2"
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Users/5437f846e41d0e910ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			firstName: 'Joey' ,
			lastName: 'Doe' ,
			email: 'joey.doe@gmail.com'
		} ) ;

		expect( response.output.data.password ).to.be.an( 'object' ) ;
		expect( response.output.data.password.algo ).to.be( 'sha512' ) ;
		expect( response.output.data.password.salt ).to.be.a( 'string' ) ;
		expect( response.output.data.password.hash ).to.be.a( 'string' ) ;
		// check the password
		expect( hash.password( "pw2" , response.output.data.password.salt , response.output.data.password.algo ) ).to.be( response.output.data.password.hash ) ;
	} ) ;

	it( "DELETE on an unexisting user" ) ;

	it( "PUT, then DELETE, then GET" ) ;

	it( "users's password should be stored as a password hash object" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Users/5437f846e41d0e910ec9a5d8' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "a-secret-password"
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Users/5437f846e41d0e910ec9a5d8' , { performer: performer } ) ;

		expect( response.output.data.password ).to.be.an( 'object' ) ;
		expect( response.output.data.password.algo ).to.be( 'sha512' ) ;
		expect( response.output.data.password.salt ).to.be.a( 'string' ) ;
		expect( response.output.data.password.hash ).to.be.a( 'string' ) ;
		
		// check back the password
		expect( hash.password( "a-secret-password" , response.output.data.password.salt , response.output.data.password.algo ) ).to.be( response.output.data.password.hash ) ;
	} ) ;
} ) ;



describe( "Groups" , () => {

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



describe( "Versioned collections" , () => {
	
	it( "POST, then PUT (overwrite), then GET" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			publicAccess: 'all'
		} ) ;

		await blog.save() ;

		var response = await app.post( '/Blogs/' + blog.getId() + '/VersionedPosts' ,
			{
				title: 'My first post!!!' ,
				content: 'Blah blah blah...' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		var postId = response.output.data.id ;

		response = await app.get( '/Blogs/' + blog.getId() + '/VersionedPosts/' + postId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_version: 1 ,
			title: 'My first post!!!' ,
			content: 'Blah blah blah...' ,
		} ) ;
		expect( response.output.data.parent.id.toString() ).to.be( blog.getId().toString() ) ;

		// PUT (overwrite)
		response = await app.put( '/Blogs/' + blog.getId() + '/VersionedPosts/' + postId  ,
			{
				title: 'My first post!!!' ,
				content: 'Edit: Blah blah blah...' ,
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/VersionedPosts/' + postId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_version: 2 ,
			title: 'My first post!!!' ,
			content: 'Edit: Blah blah blah...' ,
		} ) ;
		expect( response.output.data.parent.id.toString() ).to.be( blog.getId().toString() ) ;

		// PATCH
		response = await app.patch( '/Blogs/' + blog.getId() + '/VersionedPosts/' + postId  ,
			{
				title: 'My 1st post!!!'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/' + blog.getId() + '/VersionedPosts/' + postId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_version: 3 ,
			title: 'My 1st post!!!' ,
			content: 'Edit: Blah blah blah...' ,
		} ) ;
		expect( response.output.data.parent.id.toString() ).to.be( blog.getId().toString() ) ;
		
		
		// Now check that everything was correctly versioned as it should
		
		var batch = await app.versionsCollection.find( { '_activeVersion._id': postId , '_activeVersion._collection': 'versionedPosts' } ) ;
		expect( batch ).to.be.partially.like( [
			{
				_id: batch[ 0 ]._id ,   // unpredictable
				_version: 1 ,
				_lastModified: batch[ 0 ]._lastModified ,   // unpredictable
				_activeVersion: {
					_id: postId ,
					_collection: 'versionedPosts'
				} ,
				title: 'My first post!!!' ,
				content: 'Blah blah blah...'
            } ,
			{
				_id: batch[ 1 ]._id ,   // unpredictable
				_version: 2 ,
				_lastModified: batch[ 1 ]._lastModified ,   // unpredictable
				_activeVersion: {
					_id: postId ,
					_collection: 'versionedPosts'
				} ,
				title: 'My first post!!!' ,
				content: 'Edit: Blah blah blah...'
            } 
        ] ) ;

		// DELETE
		response = await app.delete( '/Blogs/' + blog.getId() + '/VersionedPosts/' + postId  , { performer: performer } ) ;
		await expect( () => app.get( '/Blogs/' + blog.getId() + '/VersionedPosts/' + postId , { performer: performer } ) ).to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
		
		
		// Now check that all versions are still there
		
		var batch = await app.versionsCollection.find( { '_activeVersion._id': postId , '_activeVersion._collection': 'versionedPosts' } ) ;
		expect( batch ).to.be.partially.like( [
			{
				_id: batch[ 0 ]._id ,   // unpredictable
				_version: 1 ,
				_lastModified: batch[ 0 ]._lastModified ,   // unpredictable
				_activeVersion: {
					_id: postId ,
					_collection: 'versionedPosts'
				} ,
				title: 'My first post!!!' ,
				content: 'Blah blah blah...'
            } ,
			{
				_id: batch[ 1 ]._id ,   // unpredictable
				_version: 2 ,
				_lastModified: batch[ 1 ]._lastModified ,   // unpredictable
				_activeVersion: {
					_id: postId ,
					_collection: 'versionedPosts'
				} ,
				title: 'My first post!!!' ,
				content: 'Edit: Blah blah blah...'
            } ,
			{
				_id: batch[ 2 ]._id ,   // unpredictable
				_version: 3 ,
				_lastModified: batch[ 2 ]._lastModified ,   // unpredictable
				_activeVersion: {
					_id: postId ,
					_collection: 'versionedPosts'
				} ,
				title: 'My 1st post!!!' ,
				content: 'Edit: Blah blah blah...'
            } 
        ] ) ;
	} ) ;
} ) ;



describe( "Slug usages" , () => {

	it( "when 'slugGeneration' is used on the schema, it should generate a slug from its properties array values" , async () => {
		var { app , performer } = await commonApp() ;

		// Single value
		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life!!!' ,
				description: 'This is a supa blog!' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life!!!' ,
			slugId: 'my-wonderful-life' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		// From two values
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910ec9a5df' ,
			{
				title: 'My post!!!' ,
				date: new Date( '2019-08-07' ) ,
				content: 'my content' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910ec9a5df' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My post!!!' ,
			slugId: '2019-08-07-my-post'
		} ) ;
	} ) ;

	it( "when 'slugGeneration' is used, sanitizers should be called on slug's properties before generation" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life!!!' ,
				description: 'This is a supa blog!' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910ec9a5df' ,
			{
				title: 'My post!!!' ,
				date: '2019-08-07T08:32:26.439Z' ,
				content: 'my content' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910ec9a5df' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My post!!!' ,
			slugId: '2019-08-07-my-post'
		} ) ;
	} ) ;

	it( "when a document would generate the same slugId, it should fail with a 409 - Conflict" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/Blogs' ,
			{
				title: 'My wonderful life!!!' ,
				description: 'This is a supa blog!' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		await expect( () => app.post( '/Blogs' ,
			{
				title: 'My wonderful life!!!' ,
				description: 'This is another supa blog!' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( ErrorStatus , { type: 'conflict' , code: 'duplicateKey' , httpStatus: 409 } ) ;
	} ) ;

	it( "when a document would generate the same slugId but the slugGeneration.retry option is set in the schema, it should retry by appending parts of the ID to the slug" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life!!!' ,
				description: 'This is a supa blog!' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910ec9a5df' ,
			{
				title: 'My post!!!' ,
				date: new Date( '2019-08-07' ) ,
				content: 'my content' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910ec9a5ae' ,
			{
				title: 'My post!!!' ,
				date: new Date( '2019-08-07' ) ,
				content: 'my content' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910ec9a5ae' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My post!!!' ,
			//slugId: '5437f846c41d0e910ec9a5ae-2019-08-07-my-post'
			slugId: '2019-08-07-my-post--5437f846c9a5ae'
		} ) ;
	} ) ;

	it( "the request URL should support slugId instead of ID (GET, PUT, PATCH, DELETE)" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/Blogs' ,
			{
				title: 'My wonderful life!!!' ,
				description: 'This is a supa blog!' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;
		var blogId = response.output.data.id ;

		response = await app.get( '/Blogs/my-wonderful-life' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_id: blogId ,
			title: 'My wonderful life!!!' ,
			description: 'This is a supa blog!' ,
			slugId: 'my-wonderful-life' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		// Replace it
		response = await app.put( '/Blogs/my-wonderful-life' ,
			{
				title: 'New title!' ,
				description: 'New description!' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		// So using the same slug, it should get the replacing document
		response = await app.get( '/Blogs/my-wonderful-life' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_id: blogId ,
			title: 'New title!' ,
			description: 'New description!' ,
			slugId: 'my-wonderful-life' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		// So using the original ID, it should get the replacing document
		response = await app.get( '/Blogs/' + blogId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_id: blogId ,
			title: 'New title!' ,
			description: 'New description!' ,
			slugId: 'my-wonderful-life' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		// Patch it
		response = await app.patch( '/Blogs/my-wonderful-life' , { title: 'A brand new title!' } , null , { performer: performer } ) ;

		// Get it using the slug
		response = await app.get( '/Blogs/my-wonderful-life' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_id: blogId ,
			title: 'A brand new title!' ,
			description: 'New description!' ,
			slugId: 'my-wonderful-life' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		// Get it using the original ID
		response = await app.get( '/Blogs/' + blogId , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			_id: blogId ,
			title: 'A brand new title!' ,
			description: 'New description!' ,
			slugId: 'my-wonderful-life' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		// Delete it
		response = await app.delete( '/Blogs/my-wonderful-life' , { performer: performer } ) ;

		// Both URL should fail
		await expect( () => app.get( '/Blogs/' + blogId , { performer: performer } ) ).to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
		await expect( () => app.get( '/Blogs/my-wonderful-life' , { performer: performer } ) ).to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
	} ) ;
} ) ;



describe( "Auto collection" , () => {

	it( "Root auto collection" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{			title: 'My wonderful life!!!' ,
				description: 'This is a supa blog!' ,
				publicAccess: 'all' } ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life!!!' ,
			slugId: 'my-wonderful-life' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		response = await app.get( '/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life!!!' ,
			slugId: 'my-wonderful-life' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		response = await app.get( '/my-wonderful-life' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life!!!' ,
			slugId: 'my-wonderful-life' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;
	} ) ;

	it( "Collection's auto collection" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{			title: 'My wonderful life!!!' ,
				description: 'This is a supa blog!' ,
				publicAccess: 'all' } ,
			null ,
			{ performer: performer }
		) ;
		var blogId = response.output.data.id ;

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e9f0ec9a5d8' ,
			{			title: 'You know what?' ,
				content: "I'm happy!" ,
				publicAccess: 'all' } ,
			null ,
			{ performer: performer }
		) ;
		var postId = response.output.data.id ;

		// With every collection names in the URL
		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e9f0ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'You know what?' ,
			slugId: 'you-know-what' ,
			parent: { id: blogId , collection: 'blogs' }
		} ) ;

		// Without 'Posts' in the URL
		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8/5437f846c41d0e9f0ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'You know what?' ,
			slugId: 'you-know-what' ,
			parent: { id: blogId , collection: 'blogs' }
		} ) ;

		// Without 'Blogs' in the URL
		response = await app.get( '/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e9f0ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'You know what?' ,
			slugId: 'you-know-what' ,
			parent: { id: blogId , collection: 'blogs' }
		} ) ;

		// Without 'Blogs' and 'Posts' in the URL
		response = await app.get( '/5437f846c41d0e910ec9a5d8/5437f846c41d0e9f0ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'You know what?' ,
			slugId: 'you-know-what' ,
			parent: { id: blogId , collection: 'blogs' }
		} ) ;

		// Without 'Posts' and using slugs
		response = await app.get( '/Blogs/my-wonderful-life/you-know-what' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'You know what?' ,
			slugId: 'you-know-what' ,
			parent: { id: blogId , collection: 'blogs' }
		} ) ;

		// Without 'Blogs' and using slugs
		response = await app.get( '/my-wonderful-life/Posts/you-know-what' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'You know what?' ,
			slugId: 'you-know-what' ,
			parent: { id: blogId , collection: 'blogs' }
		} ) ;

		// Without 'Blogs' and 'Posts' and using slugs
		response = await app.get( '/my-wonderful-life/you-know-what' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'You know what?' ,
			slugId: 'you-know-what' ,
			parent: { id: blogId , collection: 'blogs' }
		} ) ;
	} ) ;
} ) ;



describe( "Tokens" , () => {

	it( "login, a.k.a. token creation using POST /Users/CREATE-TOKEN and test it with the WHO-AM-I method" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		var id = response.output.data.id ;
		expect( id ).to.be.an( 'objectId' ) ;

		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data ).to.equal( {
			userId: id ,
			token: response.output.data.token ,	// unpredictable
			type: "header" ,
			agentId: "0123456789" ,
			creationTime: response.output.data.creationTime ,	// not predictable at all
			expirationTime: response.output.data.expirationTime ,	// not predictable at all
			duration: 900000
		} ) ;
		expect( response.output.data.token.length ).to.be( 44 ) ;

		var tokenData = app.collectionNodes.users.extractFromToken( response.output.data.token ) ;

		expect( tokenData ).to.equal( {
			type: "header" ,
			userId: id.toString() ,
			agentId: "0123456789" ,
			expirationTime: response.output.data.expirationTime ,
			//increment: tokenData.increment ,	// unpredictable
			securityCode: tokenData.securityCode	// unpredictable
		} ) ;

		var token = response.output.data.token ;

		// Should found the token in the user document
		response = await app.get( '/Users/' + id , { performer: performer } ) ;
		expect( response.output.data.token[ token ] ).to.be.ok() ;

		var tokenPerformer = app.createPerformer( {
			type: "header" ,
			token: token ,
			agentId: "0123456789"
		} ) ;

		// Test the API key with the WHO-AM-I method
		response = await app.get( '/Users/WHO-AM-I' , { performer: tokenPerformer } ) ;
		expect( response.output.data ).to.equal( {
			authBy: 'token' ,
			performer: {
				_id: id ,
				groups: {} ,
				login: "bobby.fisher@gmail.com" ,
				slugId: "bobby-fisher"
			}
		} ) ;
	} ) ;

	it( "token creation using a bad login should fail" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw"
			} ,
			null ,
			{ performer: performer }
		) ;

		await expect( () => app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "wrong@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 } ) ;
	} ) ;

	it( "token creation using a bad password should fail" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw"
			} ,
			null ,
			{ performer: performer }
		) ;

		await expect( () => app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "bad pw" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 } ) ;
	} ) ;

	it( "using domain-restricted users: POST /Blogs/id/Users/CREATE-TOKEN" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/Blogs' ,
			{
				title: 'My wonderful life' ,
				description: 'This is a supa blog!' ,
				publicAccess: 'all' } ,
			null ,
			{ performer: performer }
		) ;

		var blogId = response.output.data.id ;

		response = await app.post( '/Blogs/' + blogId + '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw"
			} ,
			null ,
			{ performer: performer }
		) ;

		var id = response.output.data.id ;

		response = await app.post( '/Blogs/' + blogId + '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data.userId.toString() ).to.be( id.toString() ) ;
		expect( response.output.data.token.length ).to.be( 44 ) ;

		// Should not works globally!
		await expect( () => app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 } ) ;
	} ) ;

	it( "POST /Users/CREATE-TOKEN action should cleanup outdated tokens" , async () => {
		var { app , performer } = await commonApp() ;

		var response , id , duration , token , tokenData , newTokenData ;

		// Create the user
		response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		id = response.output.data.id ;
		expect( id ).to.be.an( 'objectId' ) ;

		duration = 300 ;

		// Create the token to test garbage collection on
		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789" ,
				duration: duration
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data ).to.equal( {
			userId: id ,
			token: response.output.data.token ,	// unpredictable
			type: "header" ,
			agentId: "0123456789" ,
			creationTime: response.output.data.creationTime ,	// not predictable at all
			expirationTime: response.output.data.expirationTime ,	// not predictable at all
			duration: duration
		} ) ;
		expect( response.output.data.token.length ).to.be( 44 ) ;

		tokenData = app.collectionNodes.users.extractFromToken( response.output.data.token ) ;

		expect( tokenData ).to.equal( {
			type: "header" ,
			userId: id.toString() ,
			agentId: "0123456789" ,
			expirationTime: response.output.data.expirationTime ,
			//increment: tokenData.increment ,	// unpredictable
			securityCode: tokenData.securityCode	// unpredictable
		} ) ;

		token = response.output.data.token ;

		// Should found the token in the user document
		response = await app.get( '/Users/' + id , { performer: performer } ) ;
		expect( response.output.data.token[ token ] ).to.be.ok() ;

		duration = 100000 ;

		// Create a new token: the first should still be there after that
		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789" ,
				duration: duration
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data ).to.equal( {
			userId: id ,
			token: response.output.data.token ,	// unpredictable
			type: "header" ,
			agentId: "0123456789" ,
			creationTime: response.output.data.creationTime ,	// not predictable at all
			expirationTime: response.output.data.expirationTime ,	// not predictable at all
			duration: duration
		} ) ;
		expect( response.output.data.token.length ).to.be( 44 ) ;

		newTokenData = app.collectionNodes.users.extractFromToken( response.output.data.token ) ;

		expect( newTokenData ).to.equal( {
			type: "header" ,
			userId: id.toString() ,
			agentId: "0123456789" ,
			expirationTime: response.output.data.expirationTime ,
			//increment: tokenData.increment ,	// unpredictable
			securityCode: newTokenData.securityCode	// unpredictable
		} ) ;

		// First token should still be there
		response = await app.get( '/Users/' + id , { performer: performer } ) ;
		expect( response.output.data.token[ token ] ).to.be.ok() ;

		// Wait so the first token will not be here anymore
		await Promise.resolveTimeout( 310 ) ;

		duration = 100000 ;

		// Create again a new token: the first should be garbage collected now
		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789" ,
				duration: duration
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data ).to.equal( {
			userId: id ,
			token: response.output.data.token ,	// unpredictable
			type: "header" ,
			agentId: "0123456789" ,
			creationTime: response.output.data.creationTime ,	// not predictable at all
			expirationTime: response.output.data.expirationTime ,	// not predictable at all
			duration: duration
		} ) ;
		expect( response.output.data.token.length ).to.be( 44 ) ;

		// The first token should have been garbage collected
		response = await app.get( '/Users/' + id , { performer: performer } ) ;
		//log.error( "%Y" , response.output.data ) ;
		expect( response.output.data.token[ token ] ).not.to.be.ok() ;
	} ) ;

	it( "POST /Users/REGENERATE-TOKEN should generate a new token using an existing one that will have its TTL shortened" , async () => {
		var { app , performer } = await commonApp() ;

		var response , oldTokenPerformer , id , oldToken , newToken , oldTokenOldExpirationTime , oldTokenNewExpirationTime ;

		// Create the user
		response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		id = response.output.data.id ;
		expect( id ).to.be.an( 'objectId' ) ;

		// Create the token
		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data ).to.equal( {
			userId: id ,
			token: response.output.data.token ,	// unpredictable
			type: "header" ,
			agentId: "0123456789" ,
			creationTime: response.output.data.creationTime ,	// not predictable at all
			expirationTime: response.output.data.expirationTime ,	// not predictable at all
			duration: 900000
		} ) ;
		expect( response.output.data.token.length ).to.be( 44 ) ;

		var tokenData = app.collectionNodes.users.extractFromToken( response.output.data.token ) ;

		expect( tokenData ).to.equal( {
			type: "header" ,
			userId: id.toString() ,
			agentId: "0123456789" ,
			expirationTime: response.output.data.expirationTime ,
			//increment: tokenData.increment ,	// unpredictable
			securityCode: tokenData.securityCode	// unpredictable
		} ) ;

		oldTokenOldExpirationTime = response.output.data.expirationTime ;
		oldToken = response.output.data.token ;

		oldTokenPerformer = app.createPerformer( {
			type: "header" ,
			userId: response.output.data.userId ,
			token: response.output.data.token ,
			agentId: "0123456789"
		} ) ;

		// Should found the token in the user document
		response = await app.get( '/Users/' + id , { performer: performer } ) ;
		expect( response.output.data.token[ oldToken ] ).to.be.ok() ;

		// Regenerate token
		response = await app.post( '/Users/REGENERATE-TOKEN' , {} , null , { performer: oldTokenPerformer } ) ;

		expect( response.output.data ).to.equal( {
			userId: id ,
			token: response.output.data.token ,	// unpredictable
			type: "header" ,
			agentId: "0123456789" ,
			creationTime: response.output.data.creationTime ,	// not predictable at all
			expirationTime: response.output.data.expirationTime ,	// not predictable at all
			duration: 900000
		} ) ;
		expect( response.output.data.token.length ).to.be( 44 ) ;

		oldTokenNewExpirationTime = response.output.data.creationTime + 10000 ;
		tokenData = app.collectionNodes.users.extractFromToken( response.output.data.token ) ;

		expect( tokenData ).to.equal( {
			type: "header" ,
			userId: id.toString() ,
			agentId: "0123456789" ,
			expirationTime: response.output.data.expirationTime ,
			//increment: tokenData.increment ,	// unpredictable
			securityCode: tokenData.securityCode	// unpredictable
		} ) ;

		newToken = response.output.data.token ;

		// Check the old token
		response = await app.get( '/Users/' + id , { performer: performer } ) ;
		expect( response.output.data.token[ oldToken ] ).to.be.ok() ;
		expect( response.output.data.token[ oldToken ].expirationTime ).not.to.be( oldTokenOldExpirationTime ) ;
		expect( response.output.data.token[ oldToken ].expirationTime ).to.be.within( oldTokenNewExpirationTime - 200 , oldTokenNewExpirationTime + 200 ) ;
		expect( response.output.data.token[ newToken ] ).to.be.ok() ;
	} ) ;

	it( "POST /Users/REVOKE-TOKEN should revoke the current token, i.e. remove it from the user document" , async () => {
		var { app , performer } = await commonApp() ;

		var response , tokenPerformer , tokenPerformerArg , id , token ;

		// Create the user
		response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		id = response.output.data.id ;
		expect( id ).to.be.an( 'objectId' ) ;

		// Create the token
		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data ).to.equal( {
			userId: id ,
			token: response.output.data.token ,	// unpredictable
			type: "header" ,
			agentId: "0123456789" ,
			creationTime: response.output.data.creationTime ,	// not predictable at all
			expirationTime: response.output.data.expirationTime ,	// not predictable at all
			duration: 900000
		} ) ;
		expect( response.output.data.token.length ).to.be( 44 ) ;

		var tokenData = app.collectionNodes.users.extractFromToken( response.output.data.token ) ;

		expect( tokenData ).to.equal( {
			type: "header" ,
			userId: id.toString() ,
			agentId: "0123456789" ,
			expirationTime: response.output.data.expirationTime ,
			//increment: tokenData.increment ,	// unpredictable
			securityCode: tokenData.securityCode	// unpredictable
		} ) ;

		token = response.output.data.token ;

		tokenPerformerArg = {
			type: "header" ,
			userId: response.output.data.userId ,
			token: response.output.data.token ,
			agentId: "0123456789"
		} ;

		tokenPerformer = app.createPerformer( tokenPerformerArg ) ;

		// Should found the token in the user document
		response = await app.get( '/Users/' + id , { performer: performer } ) ;
		expect( response.output.data.token[ token ] ).to.be.ok() ;


		// Revoke the token now
		response = await app.post( '/Users/REVOKE-TOKEN' , {} , null , { performer: tokenPerformer } ) ;

		// Should not found the token anymore
		response = await app.get( '/Users/' + id , { performer: performer } ) ;
		expect( response.output.data.token[ token ] ).not.to.be.ok() ;

		// We recreate a new performer, or the test will fail: it will use a cached user.
		// It's worth noting here that a new performer IS ACTUALLY CREATED for each request in real apps.
		tokenPerformer = app.createPerformer( tokenPerformerArg ) ;

		await expect( () => app.post( '/Users/REVOKE-TOKEN' , {} , null , { performer: tokenPerformer } ) )
			.to.reject( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Token not found.' } ) ;
	} ) ;

	it( "POST /Users/REVOKE-ALL-TOKENS should revoke all tokens, i.e. remove them from the user document" , async () => {
		var { app , performer } = await commonApp() ;

		var response , id , tokenPerformer , tokenPerformerArg , token , tokenPerformer2 , token2 ;


		// Create the user
		response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		id = response.output.data.id ;
		expect( id ).to.be.an( 'objectId' ) ;

		// Create the token #1
		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		token = response.output.data.token ;

		tokenPerformerArg = {
			type: "header" ,
			userId: response.output.data.userId ,
			token: response.output.data.token ,
			agentId: "0123456789"
		} ;

		tokenPerformer = app.createPerformer( tokenPerformerArg ) ;

		// Create the token #2
		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		token2 = response.output.data.token ;

		tokenPerformerArg = {
			type: "header" ,
			userId: response.output.data.userId ,
			token: response.output.data.token ,
			agentId: "0123456789"
		} ;

		tokenPerformer2 = app.createPerformer( tokenPerformerArg ) ;

		// Should found both tokens in the user document
		response = await app.get( '/Users/' + id , { performer: performer } ) ;
		expect( response.output.data.token[ token ] ).to.be.ok() ;
		expect( response.output.data.token[ token2 ] ).to.be.ok() ;


		// Revoke ALL tokens now
		response = await app.post( '/Users/REVOKE-ALL-TOKENS' , {} , null , { performer: tokenPerformer } ) ;

		// Should not found either token in the user document
		response = await app.get( '/Users/' + id , { performer: performer } ) ;
		expect( response.output.data.token[ token ] ).not.to.be.ok() ;
		expect( response.output.data.token[ token2 ] ).not.to.be.ok() ;

		// We recreate a new performer, or the test will fail: it will use a cached user.
		// It's worth noting here that a new performer IS ACTUALLY CREATED for each request in real apps.
		tokenPerformer = app.createPerformer( tokenPerformerArg ) ;

		await expect( () => app.post( '/Users/REVOKE-TOKEN' , {} , null , { performer: tokenPerformer } ) )
			.to.reject( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Token not found.' } ) ;

		await expect( () => app.post( '/Users/REVOKE-TOKEN' , {} , null , { performer: tokenPerformer2 } ) )
			.to.reject( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Token not found.' } ) ;
	} ) ;

	it( "'Too many tokens'" ) ;
} ) ;



describe( "API keys" , () => {

	it( "Creating an API key with the CREATE-API-KEY method and test it with the WHO-AM-I method" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		var userId = response.output.data.id ;

		response = await app.post( '/Users/' + userId + '/CREATE-API-KEY' ,
			{
				type: "header" ,
				agentId: "0123456789012345678901234567890123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data ).to.equal( {
			userId: userId ,
			type: "header" ,
			agentId: "0123456789012345678901234567890123456789" ,
			apiKey: response.output.data.apiKey		// unpredictable
		} ) ;
		expect( response.output.data.apiKey.length ).to.be( 107 ) ;
		var apiKey = response.output.data.apiKey ;
		var apiKeyData = app.collectionNodes.users.extractFromApiKey( apiKey ) ;

		expect( apiKeyData ).to.equal( {
			type: "header" ,
			userId: userId.toString() ,
			agentId: "0123456789012345678901234567890123456789" ,
			securityCode: apiKeyData.securityCode	// unpredictable
		} ) ;

		// Should found the apiKey in the user document
		response = await app.get( '/Users/' + userId , { performer: performer } ) ;
		expect( response.output.data.apiKeys ).to.equal( [ {
			algo: "sha512" ,
			hash: response.output.data.apiKeys[ 0 ].hash ,	// unpredictable
			salt: response.output.data.apiKeys[ 0 ].salt ,	// unpredictable
			start: apiKey.slice( 0 , 6 )
		} ] ) ;

		var apiKeyPerformer = app.createPerformer( {
			type: "header" ,
			apiKey: apiKey ,
			agentId: "0123456789012345678901234567890123456789"
		} ) ;

		// Test the API key with the WHO-AM-I method
		response = await app.get( '/Users/WHO-AM-I' , { performer: apiKeyPerformer } ) ;
		expect( response.output.data ).to.equal( {
			authBy: 'apiKey' ,
			performer: {
				_id: userId ,
				groups: {} ,
				login: "bobby.fisher@gmail.com" ,
				slugId: "bobby-fisher"
			}
		} ) ;
	} ) ;
	
	it( "POST to the REVOKE-API-KEY method should remove a specific API key from the user document" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		var userId = response.output.data.id ;

		response = await app.post( '/Users/' + userId + '/CREATE-API-KEY' ,
			{
				type: "header" ,
				agentId: "0123456789012345678901234567890123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		var apiKey1 = response.output.data.apiKey ;

		response = await app.post( '/Users/' + userId + '/CREATE-API-KEY' ,
			{
				type: "header" ,
				agentId: "0123456789012345678901234567890123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		var apiKey2 = response.output.data.apiKey ;

		// Should found the apiKey in the user document
		response = await app.get( '/Users/' + userId , { performer: performer } ) ;
		expect( response.output.data.apiKeys ).to.equal( [
			{
				algo: "sha512" ,
				hash: response.output.data.apiKeys[ 0 ].hash ,	// unpredictable
				salt: response.output.data.apiKeys[ 0 ].salt ,	// unpredictable
				start: apiKey1.slice( 0 , 6 )
			} ,
			{
				algo: "sha512" ,
				hash: response.output.data.apiKeys[ 1 ].hash ,	// unpredictable
				salt: response.output.data.apiKeys[ 1 ].salt ,	// unpredictable
				start: apiKey2.slice( 0 , 6 )
			}
		] ) ;
		
		// Revoke the API key now
		response = await app.post( '/Users/' + userId + '/REVOKE-API-KEY' , { apiKey: apiKey1 } , null , { performer: performer } ) ;
		expect( response.output.data ).to.equal( { removed: 1 } ) ;

		// Should not found the first apiKey anymore
		response = await app.get( '/Users/' + userId , { performer: performer } ) ;
		expect( response.output.data.apiKeys ).to.equal( [
			{
				algo: "sha512" ,
				hash: response.output.data.apiKeys[ 0 ].hash ,	// unpredictable
				salt: response.output.data.apiKeys[ 0 ].salt ,	// unpredictable
				start: apiKey2.slice( 0 , 6 )
			}
		] ) ;

		// Revoke the API key now
		response = await app.post( '/Users/' + userId + '/REVOKE-API-KEY' , { apiKey: apiKey2 } , null , { performer: performer } ) ;
		expect( response.output.data ).to.equal( { removed: 1 } ) ;

		// Should not found any apiKey anymore
		response = await app.get( '/Users/' + userId , { performer: performer } ) ;
		expect( response.output.data.apiKeys ).to.equal( [] ) ;
	} ) ;
	
	it( "POST to the REVOKE-ALL-API-KEYS method should remove all API key from the user document" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		var userId = response.output.data.id ;

		response = await app.post( '/Users/' + userId + '/CREATE-API-KEY' ,
			{
				type: "header" ,
				agentId: "0123456789012345678901234567890123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		var apiKey1 = response.output.data.apiKey ;

		response = await app.post( '/Users/' + userId + '/CREATE-API-KEY' ,
			{
				type: "header" ,
				agentId: "0123456789012345678901234567890123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		var apiKey2 = response.output.data.apiKey ;

		// Should found the apiKey in the user document
		response = await app.get( '/Users/' + userId , { performer: performer } ) ;
		expect( response.output.data.apiKeys ).to.equal( [
			{
				algo: "sha512" ,
				hash: response.output.data.apiKeys[ 0 ].hash ,	// unpredictable
				salt: response.output.data.apiKeys[ 0 ].salt ,	// unpredictable
				start: apiKey1.slice( 0 , 6 )
			} ,
			{
				algo: "sha512" ,
				hash: response.output.data.apiKeys[ 1 ].hash ,	// unpredictable
				salt: response.output.data.apiKeys[ 1 ].salt ,	// unpredictable
				start: apiKey2.slice( 0 , 6 )
			}
		] ) ;
		
		// Revoke ALL API key now
		response = await app.post( '/Users/' + userId + '/REVOKE-ALL-API-KEYS' , {} , null , { performer: performer } ) ;
		expect( response.output.data ).to.equal( { removed: 2 } ) ;

		// Should not found the apiKey anymore
		response = await app.get( '/Users/' + userId , { performer: performer } ) ;
		expect( response.output.data.apiKeys ).to.equal( [] ) ;
	} ) ;

	it( "'Too many API keys'" ) ;
	it( "Test SYSTEM API KEY" ) ;
} ) ;



describe( "Access" , () => {

	var app , performer ,
		notConnectedPerformer ,
		authorizedId , authorizedPerformer ,
		authorizedByGroupId , authorizedByGroupPerformer ,
		notEnoughAuthorizedId , notEnoughAuthorizedPerformer ,
		unauthorizedId , unauthorizedPerformer ,
		authorizedGroupId , unauthorizedGroupId ;



	// Create the users for the test

	beforeEach( async () => {
		( { app , performer } = await commonApp() ) ;
		notConnectedPerformer = app.createPerformer() ;

		var response = await app.post( '/Users' ,
			{
				firstName: "Bobby" ,
				lastName: "Fisher" ,
				email: "bobby.fisher@gmail.com" ,
				password: "pw"
			} ,
			null ,
			{ performer: performer }
		) ;

		authorizedId = response.output.data.id ;

		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data.userId.toString() ).to.be( authorizedId.toString() ) ;

		authorizedPerformer = app.createPerformer( {
			type: "header" ,
			userId: response.output.data.userId ,
			token: response.output.data.token ,
			agentId: "0123456789"
		} ) ;

		response = await app.post( '/Users' ,
			{
				firstName: "Groupy" ,
				lastName: "Groups" ,
				email: "groupy@gmail.com" ,
				password: "groupy"
			} ,
			null ,
			{ performer: performer }
		) ;

		authorizedByGroupId = response.output.data.id ;

		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "groupy@gmail.com" ,
				password: "groupy" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data.userId.toString() ).to.be( authorizedByGroupId.toString() ) ;

		authorizedByGroupPerformer = app.createPerformer( {
			type: "header" ,
			userId: response.output.data.userId ,
			token: response.output.data.token ,
			agentId: "0123456789"
		} ) ;

		response = await app.post( '/Users' ,
			{
				firstName: "not" ,
				lastName: "enough" ,
				email: "not-enough@gmail.com" ,
				password: "notenough"
			} ,
			null ,
			{ performer: performer }
		) ;

		notEnoughAuthorizedId = response.output.data.id ;

		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "not-enough@gmail.com" ,
				password: "notenough" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data.userId.toString() ).to.be( notEnoughAuthorizedId.toString() ) ;

		notEnoughAuthorizedPerformer = app.createPerformer( {
			type: "header" ,
			userId: response.output.data.userId ,
			token: response.output.data.token ,
			agentId: "0123456789"
		} ) ;

		response = await app.post( '/Users' ,
			{
				firstName: "Peon" ,
				lastName: "Peon" ,
				email: "peon@gmail.com" ,
				password: "peon"
			} ,
			null ,
			{ performer: performer }
		) ;

		unauthorizedId = response.output.data.id ;

		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "peon@gmail.com" ,
				password: "peon" ,
				agentId: "0123456789"
			} ,
			null ,
			{ performer: performer }
		) ;

		expect( response.output.data.userId.toString() ).to.be( unauthorizedId.toString() ) ;

		unauthorizedPerformer = app.createPerformer( {
			type: "header" ,
			userId: response.output.data.userId ,
			token: response.output.data.token ,
			agentId: "0123456789"
		} ) ;

		response = await app.post( '/Groups' ,
			{
				name: "unauthorized group" ,
				users: [ notEnoughAuthorizedId , authorizedByGroupId ]
			} ,
			null ,
			{ performer: performer }
		) ;

		unauthorizedGroupId = response.output.data.id ;

		response = await app.post( '/Groups' ,
			{
				name: "authorized group" ,
				users: [ authorizedByGroupId ]
			} ,
			null ,
			{ performer: performer }
		) ;

		authorizedGroupId = response.output.data.id ;
	} ) ;



	it( "Check that groups are correctly initialized" , async () => {
		var groups ;
		
		//authorizedByGroupPerformer.reset() ;
		
		groups = await authorizedByGroupPerformer.getGroups() ;
		expect( groups ).to.be.partially.like( [
			{ _id: unauthorizedGroupId , name: "unauthorized group" } ,
			{ _id: authorizedGroupId , name: "authorized group" }
		] ) ;

		groups = await notEnoughAuthorizedPerformer.getGroups() ;
		expect( groups ).to.be.partially.like( [
			{ _id: unauthorizedGroupId , name: "unauthorized group" }
		] ) ;
	} ) ;
	
	it( "GET a restricted resource performed by various connected and non-connected users" , async () => {
		var response , userAccess ;

		userAccess = {} ;
		userAccess[ authorizedId ] = 'read' ;	// Minimal right that pass the check
		userAccess[ notEnoughAuthorizedId ] = 'passThrough' ;	// Maximal right that does not pass the check
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;

		// User listed and with enough rights
		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life 2!!!' ,
			description: 'This is a supa blog! (x2)'
		} ) ;

		// Non-connected user
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public access forbidden.' } ) ;

		// User not listed in specific rights
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
		
		// User listed, but with too low rights
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
	} ) ;

	it( "GET a restricted resource performed by a token that has already expired should fail" , async () => {
		var response , userAccess , expiredTokenPerformer ;

		response = await app.post( '/Users/CREATE-TOKEN' ,
			{
				type: "header" ,
				login: "bobby.fisher@gmail.com" ,
				password: "pw" ,
				agentId: "0123456789" ,
				duration: 0
			} ,
			null ,
			{ performer: performer }
		) ;
		expect( response.output.data ).to.partially.equal( { userId: authorizedId } ) ;

		expiredTokenPerformer = app.createPerformer( {
			type: "header" ,
			userId: response.output.data.userId ,
			token: response.output.data.token ,
			agentId: "0123456789"
		} ) ;
		
		userAccess = {} ;
		userAccess[ authorizedId ] = 'read' ;	// Minimal right that pass the check

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life 2!!!' ,
			description: 'This is a supa blog! (x2)'
		} ) ;

		// Expired token
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: expiredTokenPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'This token has already expired.' } ) ;
	} ) ;

	it( "GET a collection having restricted resources, performed by various connected and non-connected users" , async () => {
		var response , userAccess , batch , titles ;

		response = await app.post( '/Blogs' ,
			{
				title: 'Public' ,
				description: 'This is public' ,
				publicAccess: 'read'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		userAccess = {} ;
		userAccess[ authorizedId ] = 'read' ;
		userAccess[ notEnoughAuthorizedId ] = 'read' ;
		
		response = await app.post( '/Blogs' ,
			{
				title: 'Selective' ,
				description: 'This is selective' ,
				userAccess: userAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		userAccess = {} ;
		userAccess[ authorizedId ] = 'read' ;
		userAccess[ notEnoughAuthorizedId ] = 'passThrough' ;
		
		response = await app.post( '/Blogs' ,
			{
				title: 'Closed' ,
				description: 'This is closed' ,
				userAccess: userAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// User that can see everything
		response = await app.get( '/Blogs/' , { performer: authorizedPerformer } ) ;
		titles = response.output.data.map( e => e.title ) ;
		expect( titles ).to.have.length( 3 ) ;
		expect( titles ).to.contain( 'Public' , 'Selective' , 'Closed' ) ;
		
		// Non-connected user
		response = await app.get( '/Blogs/' , { performer: notConnectedPerformer } ) ;
		titles = response.output.data.map( e => e.title ) ;
		expect( titles ).to.have.length( 1 ) ;
		expect( titles ).to.contain( 'Public' ) ;

		// User not listed in specific rights
		response = await app.get( '/Blogs/' , { performer: unauthorizedPerformer } ) ;
		titles = response.output.data.map( e => e.title ) ;
		expect( titles ).to.have.length( 1 ) ;
		expect( titles ).to.contain( 'Public' ) ;
		
		// User listed, but with too low rights
		response = await app.get( '/Blogs/' , { performer: notEnoughAuthorizedPerformer } ) ;
		titles = response.output.data.map( e => e.title ) ;
		expect( titles ).to.have.length( 2 ) ;
		expect( titles ).to.contain( 'Public' , 'Selective' ) ;
	} ) ;

	it( "PUT (overwrite) a restricted resource performed by various connected and non-connected users" , async () => {
		var response , userAccess ;
		
		userAccess = {} ;
		userAccess[ authorizedId ] = 'readCreateModifyReplace' ;	// Minimal right that pass the check
		userAccess[ notEnoughAuthorizedId ] = 'readCreate' ;	// Maximal right that does not pass the check
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		userAccess = {} ;
		userAccess[ authorizedId ] = 'readCreateModifyReplace' ;	// Minimal right that pass the check
		userAccess[ notEnoughAuthorizedId ] = 'read' ;	// Maximal right that does not pass the check
		
		// By the authorized user
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: "I've changed my mind!" ,
				description: 'Seriously!' ,
				userAccess: userAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// Non-connected user
		await expect( () => app.put( '/Blogs/5437f846c41d0e910ec9a5d8' , { title: "I can't do that!" , description: 'Seriously!' } , null , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public access forbidden.' } ) ;

		// User not listed in specific rights
		await expect( () => app.put( '/Blogs/5437f846c41d0e910ec9a5d8' , { title: "I can't do that!" , description: 'Seriously!' } , null , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;

		// User listed, but with too low rights
		await expect( () => app.put( '/Blogs/5437f846c41d0e910ec9a5d8' , { title: "I can't do that!" , description: 'Seriously!' } , null , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
	} ) ;

	it( "PATCH a restricted resource performed by various connected and non-connected users" , async () => {
		var response , userAccess ;

		userAccess = {} ;
		userAccess[ authorizedId ] = 'readCreateModify' ;	// Minimal right that pass the check
		userAccess[ notEnoughAuthorizedId ] = 'readCreate' ;	// Maximal right that does not pass the check

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// By the authorized user
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , { title: "I've changed my mind!" } , null , { performer: authorizedPerformer } ) ;
		
		// Non-connected user
		await expect( () => app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , { title: "I can't do that!" } , null , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public patch forbidden.' } ) ;

		// User not listed in specific rights
		await expect( () => app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , { title: "I can't do that!" } , null , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Patch forbidden.' } ) ;
		
		// User listed, but with too low rights
		await expect( () => app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , { title: "I can't do that!" } , null , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Patch forbidden.' } ) ;
	} ) ;

	it( "DELETE a restricted resource performed by various connected and non-connected users" , async () => {
		var response , userAccess ;
		
		userAccess = {} ;
		userAccess[ authorizedId ] = 'all' ;	// Minimal right that pass the check
		userAccess[ notEnoughAuthorizedId ] = 'readCreateModify' ;	// Maximal right that does not pass the check
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;

		// Non-connected user
		await expect( () => app.delete( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public access forbidden.' } ) ;

		// User not listed in specific rights
		await expect( () => app.delete( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
		
		// User listed, but with too low rights
		await expect( () => app.delete( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
		
		// By the authorized user
		response = await app.delete( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedPerformer } ) ;
	} ) ;

	it( "PUT (create) into a restricted resource performed by various connected and non-connected users" , async () => {
		var response , userAccess ;
		
		userAccess = {} ;
		userAccess[ authorizedId ] = 'readCreate' ;	// Minimal right that pass the check
		userAccess[ notEnoughAuthorizedId ] = 'read' ;	// Maximal right that does not pass the check
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' ,
			{
				title: 'Put one' ,
				content: 'Blah blah blah...' ,
				publicAccess: 'read'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// Non-connected user
		await expect( () => app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d1' ,
			{
				title: 'Put two' ,
				content: 'Blah blah blah...' ,
				publicAccess: 'read'
			} ,
			null ,
			{ performer: notConnectedPerformer }
		) ).to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public access forbidden.' } ) ;
		
		// User not listed in specific rights
		await expect( () => app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d2' ,
			{
				title: 'Put three' ,
				content: 'Blah blah blah...' ,
				publicAccess: 'read'
			} ,
			null ,
			{ performer: unauthorizedPerformer }
		) ).to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
		
		// User listed, but with too low rights
		await expect( () => app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d3' ,
			{
				title: 'Put four' ,
				content: 'Blah blah blah...' ,
				publicAccess: 'read'
			} ,
			null ,
			{ performer: notEnoughAuthorizedPerformer }
		) ).to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
	} ) ;

	it( "POST into a restricted resource performed by various connected and non-connected users" , async () => {
		var response , userAccess ;
		
		userAccess = {} ;
		userAccess[ authorizedId ] = 'readCreate' ;	// Minimal right that pass the check
		userAccess[ notEnoughAuthorizedId ] = 'read' ;	// Maximal right that does not pass the check
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// By the authorized user
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' ,
			{
				title: 'Post one' ,
				content: 'Blah blah blah...' ,
				publicAccess: 'read'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;

		// Non-connected user
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' ,
			{
				title: 'Post two' ,
				content: 'Blah blah blah...' ,
				publicAccess: 'read'
			} ,
			null ,
			{ performer: notConnectedPerformer }
		) ).to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public access forbidden.' } ) ;
		
		// User not listed in specific rights
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' ,
			{
				title: 'Post three' ,
				content: 'Blah blah blah...' ,
				publicAccess: 'read'
			} ,
			null ,
			{ performer: unauthorizedPerformer }
		) ).to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;

		// User listed, but with too low rights
		 await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' ,
		 	{
				title: 'Post four' ,
				content: 'Blah blah blah...' ,
				publicAccess: 'read'
			} ,
			null ,
			{ performer: notEnoughAuthorizedPerformer }
		) ).to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
	} ) ;

	it( "Access by groups" , async () => {
		var response , userAccess , groupAccess ;
		
		userAccess = {} ;
		userAccess[ authorizedId ] = 'read' ;
		//userAccess[ authorizedByGroupId ] = 'passThrough' ;
		
		groupAccess = {} ;
		groupAccess[ authorizedGroupId ] = 'read' ;
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				groupAccess: groupAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// By the authorized user
		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life 2!!!' ,
			description: 'This is a supa blog! (x2)'
		} ) ;

		// User authorized by its group
		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedByGroupPerformer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life 2!!!' ,
			description: 'This is a supa blog! (x2)'
		} ) ;

		// Non-connected user
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public access forbidden.' } ) ;

		// User not listed in specific rights
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
		
		// User listed, but with too low rights
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
	} ) ;

	it( "PATCH of nested resource with inheritance" , async () => {
		var response , userAccess , groupAccess ;
		
		userAccess = {} ;
		
		userAccess[ authorizedId ] = {
			read: true ,
			write: true ,
			create: true ,
			inheritance: {
				read: true ,
				write: true
			}
		} ;

		userAccess[ notEnoughAuthorizedId ] = 'readCreateModify' ;	// Maximal right that does not pass the check

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'passThrough'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' ,
			{
				title: 'A boring title' ,
				content: 'Blah blah blah...'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// Authorized user
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { title: "I've changed my mind!" } , null , { performer: authorizedPerformer } ) ;
		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.partially.equal( { title: "I've changed my mind!" } ) ;

		// Non-connected user
		await expect( () => app.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { title: "I can't do that!" } , null , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public patch forbidden.' } ) ;

		// User not listed in specific rights
		await expect( () => app.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { title: "I can't do that!" } , null , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Patch forbidden.' } ) ;

		// User listed, but with too low rights
		await expect( () => app.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { title: "I can't do that!" } , null , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Patch forbidden.' } ) ;
		
		
		// Now give public access
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				publicAccess: {
					traverse: true ,
					inheritance: {
						read: true ,
						write: true
					}
				}
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;

		// Non-connected user, it can edit it!
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' ,
			{ title: "I can do that!" } ,
			null ,
			{ performer: notConnectedPerformer }
		) ;
		
		// User not listed in specific rights
		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: unauthorizedPerformer } ) ;
		expect( response.output.data ).to.partially.equal( { title: "I can do that!" } ) ;
	} ) ;

	it( "tag-less object-method execution should be public" , async () => {
		var response , userAccess , groupAccess ;
		
		userAccess = {} ;
		
		userAccess[ authorizedId ] = {
			traverse: true ,
			read: true ,
			write: true ,
			create: true
		} ;

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'passThrough'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// Authorized user
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/PUBLIC-DOUBLE' , { value: 3 } , null , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;

		// Non-connected user
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/PUBLIC-DOUBLE' , { value: 3 } , null , { performer: notConnectedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;

		// User not listed in specific rights
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/PUBLIC-DOUBLE' , { value: 3 } , null , { performer: unauthorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;
	} ) ;

	it( "tagged object-method execution should rely on the 'exec' access" , async () => {
		var response , userAccess , groupAccess ;
		
		userAccess = {} ;
		
		userAccess[ authorizedId ] = {
			traverse: true ,
			read: true ,
			write: true ,
			create: true ,
			exec: [ 'method.double' ] ,
			//inheritance: { read: true , write: true }
		} ;

		// Maximal right that does not pass the check
		userAccess[ notEnoughAuthorizedId ] = {
			traverse: true ,
			read: true ,
			write: true ,
			create: true ,
			exec: [ 'random-tag' ] ,
			//inheritance: { read: true , write: true }
		} ;

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'passThrough'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// Authorized user
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/DOUBLE' , { value: 3 } , null , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;

		// Non-connected user
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/DOUBLE' , { value: 3 } , null , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 } ) ;

		// User not listed in specific rights
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/DOUBLE' , { value: 3 } , null , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 } ) ;

		// User listed, but with too low rights
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/DOUBLE' , { value: 3 } , null , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 } ) ;
		
		// Now give public access
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				publicAccess: {
					traverse: true ,
					exec: [ 'method.double' ]
					//inheritance: { read: true , write: true }
				}
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;

		// Non-connected user
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/DOUBLE' , { value: 3 } , null , { performer: notConnectedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;

		// User not listed in specific rights
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/DOUBLE' , { value: 3 } , null , { performer: unauthorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;

		// User listed, but with too low rights
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/DOUBLE' , { value: 3 } , null , { performer: notEnoughAuthorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;
	} ) ;


	it( "object-method access inheritance" , async () => {
		var response , userAccess , groupAccess ;
		
		userAccess = {} ;
		
		userAccess[ authorizedId ] = {
			traverse: true ,
			read: true ,
			write: true ,
			create: true ,
			//exec: [ 'method.double' ] ,
			inheritance: { read: true , write: true , exec: [ 'method.double' ] }
		} ;

		// Maximal right that does not pass the check
		userAccess[ notEnoughAuthorizedId ] = {
			traverse: true ,
			read: true ,
			write: true ,
			create: true ,
			inheritance: { read: true , write: true , exec: [ 'random-tag' ] }
		} ;

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'passThrough'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' ,
			{
				title: 'A boring title' ,
				content: 'Blah blah blah...'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// Authorized user
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;

		// Non-connected user
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 } ) ;

		// User not listed in specific rights
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 } ) ;

		// User listed, but with too low rights
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 } ) ;
		
		// Now give public access
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				publicAccess: {
					traverse: true ,
					//exec: [ 'method.double' ]
					inheritance: { read: true , write: true , exec: [ 'method.double' ] }
				}
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;

		// Non-connected user
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: notConnectedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;

		// User not listed in specific rights
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: unauthorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;

		// User listed, but with too low rights
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: notEnoughAuthorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;
	} ) ;

	it( "xxx yyy tag-less collection-method execution should be public" , async () => {
		var response , userAccess , groupAccess ;
		
		userAccess = {} ;
		
		userAccess[ authorizedId ] = {
			traverse: true ,
			read: true ,
			write: true ,
			create: true
		} ;

		response = await app.patch( '/' , {
			userAccess: userAccess ,
			publicAccess: 'passThrough'
		} ) ;
		
		// Authorized user
		response = await app.post( '/Blogs/PUBLIC-TRIPLE' , { value: 3 } , null , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 9 } ) ;

		// Non-connected user
		response = await app.post( '/Blogs/PUBLIC-TRIPLE' , { value: 3 } , null , { performer: notConnectedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 9 } ) ;

		// User not listed in specific rights
		response = await app.post( '/Blogs/PUBLIC-TRIPLE' , { value: 3 } , null , { performer: unauthorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 9 } ) ;
	} ) ;

	it( "xxx tagged collection-method execution should rely on the 'exec' access" , async () => {
		var response , userAccess , groupAccess ;
		
		userAccess = {} ;
		
		userAccess[ authorizedId ] = {
			traverse: true ,
			read: true ,
			write: true ,
			create: true ,
			exec: [ 'method.double' ] ,
			//inheritance: { read: true , write: true }
		} ;

		// Maximal right that does not pass the check
		userAccess[ notEnoughAuthorizedId ] = {
			traverse: true ,
			read: true ,
			write: true ,
			create: true ,
			exec: [ 'random-tag' ] ,
			//inheritance: { read: true , write: true }
		} ;

		response = await app.patch( '/' , {
			userAccess: userAccess ,
			publicAccess: 'passThrough'
		} ) ;
		
		// Authorized user
		response = await app.post( '/Blogs/TRIPLE' , { value: 3 } , null , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 9 } ) ;

		// Non-connected user
		await expect( () => app.post( '/Blogs/TRIPLE' , { value: 3 } , null , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 } ) ;

		// User not listed in specific rights
		await expect( () => app.post( '/Blogs/TRIPLE' , { value: 3 } , null , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 } ) ;

		// User listed, but with too low rights
		await expect( () => app.post( '/Blogs/TRIPLE' , { value: 3 } , null , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 } ) ;
		
		// Now give public access
		response = await app.patch( '/' , {
			publicAccess: {
				traverse: true ,
				exec: [ 'method.double' ]
				//inheritance: { read: true , write: true }
			}
		} ) ;

		// Non-connected user
		response = await app.post( '/Blogs/TRIPLE' , { value: 3 } , null , { performer: notConnectedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 9 } ) ;

		// User not listed in specific rights
		response = await app.post( '/Blogs/TRIPLE' , { value: 3 } , null , { performer: unauthorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 9 } ) ;

		// User listed, but with too low rights
		response = await app.post( '/Blogs/TRIPLE' , { value: 3 } , null , { performer: notEnoughAuthorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 9 } ) ;
		
		throw new Error( "shadowing!" ) ;
	} ) ;


	it( "xxx collection-method access inheritance" , async () => {
		throw new Error( "write it!" ) ;
		var response , userAccess , groupAccess ;
		
		userAccess = {} ;
		
		userAccess[ authorizedId ] = {
			traverse: true ,
			read: true ,
			write: true ,
			create: true ,
			//exec: [ 'method.double' ] ,
			inheritance: { read: true , write: true , exec: [ 'method.double' ] }
		} ;

		// Maximal right that does not pass the check
		userAccess[ notEnoughAuthorizedId ] = {
			traverse: true ,
			read: true ,
			write: true ,
			create: true ,
			inheritance: { read: true , write: true , exec: [ 'random-tag' ] }
		} ;

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'passThrough'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' ,
			{
				title: 'A boring title' ,
				content: 'Blah blah blah...'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// Authorized user
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;

		// Non-connected user
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 } ) ;

		// User not listed in specific rights
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 } ) ;

		// User listed, but with too low rights
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 } ) ;
		
		// Now give public access
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				publicAccess: {
					traverse: true ,
					//exec: [ 'method.double' ]
					inheritance: { read: true , write: true , exec: [ 'method.double' ] }
				}
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;

		// Non-connected user
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: notConnectedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;

		// User not listed in specific rights
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: unauthorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;

		// User listed, but with too low rights
		response = await app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0/DOUBLE' , { value: 3 } , null , { performer: notEnoughAuthorizedPerformer } ) ;
		expect( response.output.data ).to.equal( { result: 6 } ) ;
	} ) ;

	it( "zzz PATCH of nested resource with per-collection inheritance" , async () => {
		var response , userAccess , groupAccess ;
		
		userAccess = {} ;
		
		userAccess[ authorizedId ] = {
			read: true ,
			write: true ,
			collections: {
				posts: {
					create: true ,
					query: true ,
					inheritance: {
						read: true ,
						write: true
					}
				}
			}
		} ;

		userAccess[ notEnoughAuthorizedId ] = 'readCreateModify' ;	// Maximal right that does not pass the check

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'passThrough'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' ,
			{
				title: 'A boring title' ,
				content: 'Blah blah blah...'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// Authorized user
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { title: "I've changed my mind!" } , null , { performer: authorizedPerformer } ) ;
		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.partially.equal( { title: "I've changed my mind!" } ) ;

		// Non-connected user
		await expect( () => app.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { title: "I can't do that!" } , null , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public patch forbidden.' } ) ;

		// User not listed in specific rights
		await expect( () => app.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { title: "I can't do that!" } , null , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Patch forbidden.' } ) ;

		// User listed, but with too low rights
		await expect( () => app.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { title: "I can't do that!" } , null , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Patch forbidden.' } ) ;
		
		
		// Now give public access
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				publicAccess: {
					traverse: true ,
					collections: {
						posts: {
							inheritance: {
								read: true ,
								write: true
							}
						}
					}
				}
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;

		// Non-connected user, it can edit it!
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' ,
			{ title: "I can do that!" } ,
			null ,
			{ performer: notConnectedPerformer }
		) ;
		
		// User not listed in specific rights
		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: unauthorizedPerformer } ) ;
		expect( response.output.data ).to.partially.equal( { title: "I can do that!" } ) ;
	} ) ;

	it( "zzz per-collection-access shadowing object access for collection once defined (whether specific or not)" , async () => {
		var response , userAccess , groupAccess ;
		
		userAccess = {} ;
		
		userAccess[ authorizedId ] = {
			read: true ,
			write: true ,
			create: true
		} ;

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'passThrough'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' ,
			{
				title: 'A boring title' ,
				content: 'Blah blah blah...'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ).to.eventually.be.ok() ;
		
		// It should be sufficient to shadow the base-object
		userAccess[ authorizedId ].collections = {} ;
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{ userAccess: userAccess } ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' ,
			{
				title: 'A boring title' ,
				content: 'Blah blah blah...'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ).to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;

		// It should shadow the base-object
		userAccess[ authorizedId ].collections.posts = { create: false } ;
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{ userAccess: userAccess } ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		await expect( () => app.post( '/Blogs/5437f846c41d0e910ec9a5d8/Posts' ,
			{
				title: 'A boring title' ,
				content: 'Blah blah blah...'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ).to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
	} ) ;

	it( "zzz DELETE of nested resource with per-collection inheritance" , async () => {
		var response , userAccess , groupAccess ;
		
		userAccess = {} ;
		
		userAccess[ authorizedId ] = {
			read: true ,
			write: true ,
			collections: {
				posts: {
					create: true ,
					query: true ,
					inheritance: {
						read: true ,
						write: true ,
						//delete: true
					}
				}
			}
		} ;

		userAccess[ notEnoughAuthorizedId ] = 'readCreateModify' ;	// Maximal right that does not pass the check

		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'passThrough'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' ,
			{
				title: 'A boring title' ,
				content: 'Blah blah blah...'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;
		
		// Non-connected user
		await expect( () => app.delete( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public access forbidden.' } ) ;

		// User not listed in specific rights
		await expect( () => app.delete( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;

		// User listed, but with too low rights
		await expect( () => app.delete( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
		
		// Not yet authorized user
		await expect( () => app.delete( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: authorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;

		// Now give delete access
		userAccess[ authorizedId ].collections.posts.inheritance.delete = true ;
		response = await app.patch( '/Blogs/5437f846c41d0e910ec9a5d8' , { userAccess: userAccess } , null , { performer: authorizedPerformer } ) ;

		// Non-connected user
		await expect( () => app.delete( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public access forbidden.' } ) ;

		// User not listed in specific rights
		await expect( () => app.delete( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;

		// User listed, but with too low rights
		await expect( () => app.delete( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
		
		// Authorized user
		response = await app.delete( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: authorizedPerformer } ) ;
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8/Posts/5437f846c41d0e910e59a5d0' , { performer: authorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'notFound' , httpStatus: 404 , message: 'Document not found' } ) ;
	} ) ;

	it( "inheritance depth tests needed" ) ;
	it( "more inheritance tests needed" ) ;
	it( "fine-grained access" ) ;

	it( "document properties filtering" , async () => {
		var response , userAccess ;

		userAccess = {} ;
		userAccess[ authorizedId ] = { read: ['content'] } ;	// Minimal right that pass the check
		userAccess[ notEnoughAuthorizedId ] = 'passThrough' ;	// Maximal right that does not pass the check
		
		response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				userAccess: userAccess ,
				publicAccess: 'none'
			} ,
			null ,
			{ performer: authorizedPerformer }
		) ;

		// User listed and with enough rights
		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: authorizedPerformer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life 2!!!' ,
			description: 'This is a supa blog! (x2)'
		} ) ;

		// Non-connected user
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: notConnectedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'unauthorized' , httpStatus: 401 , message: 'Public access forbidden.' } ) ;

		// User not listed in specific rights
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: unauthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
		
		// User listed, but with too low rights
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: notEnoughAuthorizedPerformer } ) )
			.to.reject.with( ErrorStatus , { type: 'forbidden' , httpStatus: 403 , message: 'Access forbidden.' } ) ;
	} ) ;
} ) ;



describe( "Indexes" , () => {

	it( "Test indexes" ) ;
} ) ;



describe( "Hooks" , () => {

	it( "Test init (app) hooks" ) ;
	it( "Test beforeCreate hooks" ) ;
	it( "Test afterCreate hooks" ) ;
	it( "Test beforeModify hooks" ) ;
	it( "Test afterModify hooks" ) ;
	it( "Test beforeDelete hooks" ) ;
	it( "Test afterDelete hooks" ) ;

	it( "Test search hooks" ) ;

	it( "Test beforeCreateToken hooks" ) ;
	it( "Test afterCreateToken hooks" ) ;
} ) ;



describe( "Custom methods (POST to a METHOD)" , () => {

	it( "Custom root object method" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/DOUBLE' , { value: 4 } , null , { performer: performer } ) ;
		expect( response.output.data ).to.equal( { result: 8 } ) ;

		response = await app.get( '/DOUBLE' , { performer: performer } ) ;
		expect( response.output.data ).to.equal( null ) ;
	} ) ;

	it( "Custom collection method" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/Users/DO-SOMETHING' , { to: 'toto' } , null , { performer: performer } ) ;
		expect( response.output.data ).to.equal( { done: "something" , to: "toto" } ) ;
		
		response = await app.get( '/Users/DO-SOMETHING' , { performer: performer } ) ;
		expect( response.output.data ).to.equal( { done: "nothing" , cause: "this is a GET request" } ) ;
	} ) ;

	it( "Custom object method" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.post( '/Users' ,
			{
				firstName: "Joe" ,
				lastName: "Doe" ,
				email: "joe.doe@gmail.com" ,
				password: "pw" ,
				publicAccess: "all"
			} ,
			null ,
			{ performer: performer }
		) ;
		var userId = response.output.data.id ;
		
		response = await app.post( '/Users/' + userId + '/CHANGE-FIRST-NAME' ,
			{ lastName: 'Toto' } ,
			null ,
			{ performer: performer }
		) ;
		expect( response.output.data ).to.be.partially.like( {
			done: 'nothing' ,
			to: { firstName: 'Joe' , lastName: 'Doe' }
		} ) ;
		
		response = await app.post( '/Users/' + userId + '/CHANGE-FIRST-NAME' ,
			{ firstName: 'Toto' } ,
			null ,
			{ performer: performer }
		) ;
		expect( response.output.data ).to.be.partially.like( {
			done: 'something' ,
			to: { firstName: 'Toto' , lastName: 'Doe' }
		} ) ;
		
		response = await app.get( '/Users/' + userId + '/CHANGE-FIRST-NAME' , { performer: performer } ) ;
		expect( response.output.data ).to.equal( {
			done: 'nothing' ,
			cause: "this is a GET request"
		} ) ;
		
		response = await app.get( '/Users/' + userId , { performer: performer } ) ;
		expect( response.output.data ).to.be.partially.like( {
			firstName: 'Toto' ,
			lastName: 'Doe'
		} ) ;
	} ) ;
} ) ;




describe( "Alter Schema" , () => {

	it( "altered schema should alter the SCHEMA method output" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			customSchema: {
				posts: {
					extraProperties: true ,
					properties: {
						custom: { type: 'string' }
					}
				}
			} ,
			publicAccess: 'all'
		} ) ;
		await blog.save() ;
		
		var response = await app.get( '/Blogs/' + blog.getId() + '/Posts/SCHEMA' , { performer: performer } ) ;
		expect( response.output.data ).to.equal(
			tree.extend( { deep: true } , app.root.children.blogs.children.posts.schema , { properties: { custom: { type: 'string' } } } )
		) ;
	} ) ;

	it( "altered schema should alter POST" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			customSchema: {
				posts: {
					extraProperties: true ,
					properties: {
						custom: { type: 'string' }
					}
				}
			} ,
			publicAccess: 'all'
		} ) ;
		await blog.save() ;
		
		await expect( () => app.post( '/Blogs/' + blog.getId() + '/Posts/' ,
			{
				title: 'My first post!' ,
				content: 'Blah blah blah.'
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( doormen.ValidatorError , { name: 'ValidatorError' } ) ;

		await expect( () => app.post( '/Blogs/' + blog.getId() + '/Posts/' ,
			{
				title: 'My first post!' ,
				content: 'Blah blah blah.' ,
				custom: 12
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( doormen.ValidatorError , { name: 'ValidatorError' } ) ;
		
		var response = await app.post( '/Blogs/' + blog.getId() + '/Posts/' ,
			{
				title: 'My first post!' ,
				content: 'Blah blah blah.' ,
				custom: 'value'
			} ,
			null ,
			{ performer: performer }
		) ;
		var postId = response.output.data.id ;
		
		response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + postId , { performer: performer } ) ;
		expect( response.output.data ).to.be.partially.like( {
			title: 'My first post!' ,
			content: 'Blah blah blah.' ,
			custom: 'value'
		} ) ;
	} ) ;

	it( "altered schema should alter PUT" , async () => {
		var { app , performer } = await commonApp() ;

		var response , postId = '123456789612345678901234' ;

		var blog = await app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			customSchema: {
				posts: {
					extraProperties: true ,
					properties: {
						custom: { type: 'string' }
					}
				}
			} ,
			publicAccess: 'all'
		} ) ;
		await blog.save() ;
		
		await expect( () => app.put( '/Blogs/' + blog.getId() + '/Posts/' + postId ,
			{
				title: 'My first post!' ,
				content: 'Blah blah blah.'
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( doormen.ValidatorError , { name: 'ValidatorError' } ) ;

		await expect( () => app.put( '/Blogs/' + blog.getId() + '/Posts/' + postId ,
			{
				title: 'My first post!' ,
				content: 'Blah blah blah.' ,
				custom: 12
			} ,
			null ,
			{ performer: performer }
		) ).to.reject( doormen.ValidatorError , { name: 'ValidatorError' } ) ;

		response = await app.put( '/Blogs/' + blog.getId() + '/Posts/' + postId ,
			{
				title: 'My first post!' ,
				content: 'Blah blah blah.' ,
				custom: 'value'
			} ,
			null ,
			{ performer: performer }
		) ;
		
		response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + postId , { performer: performer } ) ;
		expect( response.output.data ).to.be.partially.like( {
			title: 'My first post!' ,
			content: 'Blah blah blah.' ,
			custom: 'value'
		} ) ;
	} ) ;

	it( "altered schema should alter PATCH" , async () => {
		var { app , performer } = await commonApp() ;

		var blog = app.root.children.blogs.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!' ,
			customSchema: {
				posts: {
					extraProperties: true ,
					properties: {
						custom: { type: 'string' }
					}
				}
			} ,
			publicAccess: 'all'
		} ) ;
		await blog.save() ;
		
		var response = await app.post( '/Blogs/' + blog.getId() + '/Posts/' , {
				title: 'My first post!' ,
				content: 'Blah blah blah.' ,
				custom: 'value'
			} ,
			null ,
			{ performer: performer }
		) ;
		var postId = response.output.data.id ;
		
		response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + postId , { performer: performer } ) ;
		expect( response.output.data ).to.be.partially.like( {
			title: 'My first post!' ,
			content: 'Blah blah blah.' ,
			custom: 'value'
		} ) ;
		
		await expect( () => app.patch( '/Blogs/' + blog.getId() + '/Posts/' + postId , { custom: 12 } , null , { performer: performer } ) )
			.to.reject( doormen.ValidatorError , { name: 'ValidatorError' } ) ;
			
		response = await app.patch( '/Blogs/' + blog.getId() + '/Posts/' + postId , { custom: 'value2' } , null , { performer: performer } ) ;
		response = await app.get( '/Blogs/' + blog.getId() + '/Posts/' + postId , { performer: performer } ) ;
		expect( response.output.data ).to.be.partially.like( {
			title: 'My first post!' ,
			content: 'Blah blah blah.' ,
			custom: 'value2'
		} ) ;
	} ) ;
} ) ;



describe( "Populate" , () => {

	it( "Test populate" ) ;
} ) ;



describe( "Tier level" , () => {

	it( "Test tier level" ) ;
} ) ;



describe( "Scheduler" , () => {

	it( "Test the scheduler" ) ;
} ) ;



describe( "Client error management" , () => {

	it( "Test client error management" ) ;
} ) ;



describe( "Misc" , () => {

	it( "Test of the test: test helper commonApp() should clean previously created items" , async () => {
		var { app , performer } = await commonApp() ;

		var response = await app.put( '/Blogs/5437f846c41d0e910ec9a5d8' ,
			{
				title: 'My wonderful life 2!!!' ,
				description: 'This is a supa blog! (x2)' ,
				publicAccess: 'all'
			} ,
			null ,
			{ performer: performer }
		) ;

		response = await app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			title: 'My wonderful life 2!!!' ,
			description: 'This is a supa blog! (x2)' ,
			parent: { id: '/' , collection: 'root' }
		} ) ;

		// It should reset
		( { app , performer } = await commonApp() ) ;

		// Same ID than in the previous request
		await expect( () => app.get( '/Blogs/5437f846c41d0e910ec9a5d8' , { performer: performer } ) ).to.reject( ErrorStatus , { type: 'notFound' , httpStatus: 404 } ) ;
	} ) ;

	it( "Shema's 'defaultPublicAccess'" , async () => {
		var { app , performer } = await commonApp() ;
		expect( app.collectionNodes.blogs.collection.documentSchema.properties.publicAccess.default )
			.to.equal( { traverse: true , read: ['id','content'] , exec: ['id','content'] , query: true , create: true } ) ;
		expect( app.collectionNodes.comments.collection.documentSchema.properties.publicAccess.default )
			.to.equal( { read: ['id','content'] } ) ;
	} ) ;

	it.opt( "Collection with a user/password in URL" , async () => {
		/*
			First, create a user in the mongo-shell with the command:
			db.createUser( { user: 'rqtestuser' , pwd: 'rqtestpw' , roles: [ { role: "readWrite", db: "restQuery" } ] } )
		*/
		var { app , performer } = await commonApp( { defaultDomain: 'mongodb://rqtestuser:rqtestpw@localhost:27017/restQuery' } ) ;

		var response = await app.get( '/' , { performer: performer } ) ;
		expect( response.output.data ).to.partially.equal( {
			name: '/' ,
			title: 'Root' ,
			description: 'Root object' ,
			userAccess: {} ,
			groupAccess: {} ,
			publicAccess: { traverse: true , read: ['id','content'] , create: true }
		} ) ;
	} ) ;

	it.opt( "Collection with a bad user/password in URL" , async () => {
		await expect( () => commonApp( { defaultDomain: 'mongodb://rqtestuser:badpw@localhost:27017/restQuery' } ) ).to.reject() ;
	} ) ;

	it( "Test CORS" ) ;
	it( "Test agentId (token, API key)" ) ;
	
	it( "Test --buildIndexes" ) ;
	it( "Test --initDb <filepath>" ) ;
} ) ;



describe( "Historical bugs" , () => {
} ) ;

