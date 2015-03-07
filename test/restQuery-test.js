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



var restQuery = require( '../lib/restQuery.js' ) ;

var net = require( 'net' ) ;
var stream = require( 'stream' ) ;
var childProcess = require( 'child_process' ) ;

var async = require( 'async-kit' ) ;
var tree = require( 'tree-kit' ) ;
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



// clear DB: remove every item, so we can safely test
function clearDB( callback )
{
	async.parallel( [
		[ clearCollection , blogs ] ,
		[ clearCollection , posts ] ,
		[ clearCollection , comments ]
	] )
	.exec( callback ) ;
}



// clear DB: remove every item, so we can safely test
function clearDBIndexes( callback )
{
	async.parallel( [
		[ clearCollectionIndexes , blogs ] ,
		[ clearCollectionIndexes , posts ] ,
		[ clearCollectionIndexes , comments ]
	] )
	.exec( callback ) ;
}



function clearCollection( collection , callback )
{
	collection.driver.rawInit( function( error ) {
		if ( error ) { callback( error ) ; return ; }
		collection.driver.raw.remove( callback ) ;
	} ) ;
}



function clearCollectionIndexes( collection , callback )
{
	collection.driver.rawInit( function( error ) {
		if ( error ) { callback( error ) ; return ; }
		collection.driver.raw.dropIndexes( callback ) ;
	} ) ;
}



// r: httpRequest part that overwrite defaults
// body: the faked body
function fakeHttpRequest( r , body )
{
	//var req = stream.Duplex() ;
	var req = stream.PassThrough() ;
	
	if ( ! r || typeof r !== 'object' ) { r = {} ; }
	if ( ! body || typeof body !== 'string' ) { body = '' ; }
	
	tree.extend( { deep: true } , req , {
		method: "GET" ,
		url: "/" ,
		httpVersion: "1.1" ,
		headers: {
			'user-agent': "Mozilla/5.0 (X11; Linux x86_64; rv:32.0) Gecko/20100101 Firefox/32.0" ,
			'accept-language': "en-US,en;q=0.5" ,
			'connection': "keep-alive" ,
			'accept-encoding': "gzip, deflate" ,
			'accept': "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" ,
			'host': "localhost" ,
			'cache-control': "max-age=0"
		}
	} , r ) ;
	
	if ( body.length )
	{
		req.write( body ) ;
		req.headers['content-length'] = '' + body.length ;
	}
	
	req.end() ;
	
	return req ;
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



describe( "Path's node parsing" , function() {
	
	it( "should parse a valid property node as an property of the current object" , function() {
		expect( restQuery.parsePathNode( 'Users' ) ).to.be.eql( { type: 'property' , identifier: 'users' } ) ;
		
		// Invalid entries
		expect( restQuery.parsePathNode( 'U-' ) ).to.be.an( Error ) ;
	} ) ;
	
	it( "should parse a valid offset node as an offset" , function() {
		expect( restQuery.parsePathNode( '1258' ) ).to.be.eql( { type: 'offset' , identifier: 1258 } ) ;
		expect( restQuery.parsePathNode( '01258' ) ).to.be.eql( { type: 'offset' , identifier: 1258 } ) ;
		expect( restQuery.parsePathNode( '0' ) ).to.be.eql( { type: 'offset' , identifier: 0 } ) ;
		expect( restQuery.parsePathNode( '000' ) ).to.be.eql( { type: 'offset' , identifier: 0 } ) ;
		
		// Invalid entries
		expect( restQuery.parsePathNode( '000b' ).type ).not.to.be.equal( 'offset' ) ;
	} ) ;
	
	it( "should parse a valid ID node as an ID" , function() {
		expect( restQuery.parsePathNode( '51d18492541d2e3614ca2a80' ) ).to.be.eql( { type: 'ID' , identifier: '51d18492541d2e3614ca2a80' } ) ;
		expect( restQuery.parsePathNode( 'a1d18492541d2e3614ca2a80' ) ).to.be.eql( { type: 'ID' , identifier: 'a1d18492541d2e3614ca2a80' } ) ;
		expect( restQuery.parsePathNode( 'aaaaaaaaaaaaaaaaaaaaaaaa' ) ).to.be.eql( { type: 'ID' , identifier: 'aaaaaaaaaaaaaaaaaaaaaaaa' } ) ;
		expect( restQuery.parsePathNode( '111111111111111111111111' ) ).to.be.eql( { type: 'ID' , identifier: '111111111111111111111111' } ) ;
		
		// Invalid entries
		expect( restQuery.parsePathNode( '51d18492541d2e3614ca2a8' ).type ).not.to.be.equal( 'ID' ) ;
		expect( restQuery.parsePathNode( '51d18492541d2e3614ca2a80a' ).type ).not.to.be.equal( 'ID' ) ;
		expect( restQuery.parsePathNode( '51d18492541h2e3614ca2a80' ).type ).not.to.be.equal( 'ID' ) ;
	} ) ;
	
	it( "should parse a valid SID node as a SID" , function() {
		expect( restQuery.parsePathNode( 'abc' ) ).to.be.eql( { type: 'SID' , identifier: 'abc' } ) ;
		expect( restQuery.parsePathNode( 'cronvel' ) ).to.be.eql( { type: 'SID' , identifier: 'cronvel' } ) ;
		expect( restQuery.parsePathNode( 'c20nv31' ) ).to.be.eql( { type: 'SID' , identifier: 'c20nv31' } ) ;
		expect( restQuery.parsePathNode( 'my-blog-entry' ) ).to.be.eql( { type: 'SID' , identifier: 'my-blog-entry' } ) ;
		expect( restQuery.parsePathNode( 'a-24-characters-long-sid' ) ).to.be.eql( { type: 'SID' , identifier: 'a-24-characters-long-sid' } ) ;
		expect( restQuery.parsePathNode( 'agaaaaaaaaaaaaaaaaaaaaaa' ) ).to.be.eql( { type: 'SID' , identifier: 'agaaaaaaaaaaaaaaaaaaaaaa' } ) ;
		expect( restQuery.parsePathNode( '01b' ) ).to.be.eql( { type: 'SID' , identifier: '01b' } ) ;
		expect( restQuery.parsePathNode( 'azekjsdlmfjqmsljdfmklqsdlmfjslmfvqsdmljfgqsdjgmklhsdmhqgfqsdlmghlmkdhfga' ) ).to.be.eql( { type: 'SID' , identifier: 'azekjsdlmfjqmsljdfmklqsdlmfjslmfvqsdmljfgqsdjgmklhsdmhqgfqsdlmghlmkdhfga' } ) ;
		
		// Invalid entries
		expect( restQuery.parsePathNode( 'aa' ) ).to.be.an( Error ) ;
		expect( restQuery.parsePathNode( 'afaaaaaaaaaaaaaaaaaaaaaa' ).type ).not.to.be.equal( 'SID' ) ;
		expect( restQuery.parsePathNode( 'my-Blog-entry' ) ).to.be.an( Error ) ;
		expect( restQuery.parsePathNode( 'My-blog-entry' ) ).to.be.an( Error ) ;
		expect( restQuery.parsePathNode( 'aa' ) ).to.be.an( Error ) ;
		expect( restQuery.parsePathNode( 'azekjsdlmfjqmsljdfmklqsdlmfjslmfvqsdmljfgqsdjgmklhsdmhqgfqsdlmghlmkdhfgaz' ) ).to.be.an( Error ) ;
	} ) ;
	
	it( "should handle edge cases correctly" , function() {
		expect( restQuery.parsePathNode( '' ) ).to.be.an( Error ) ;
		expect( restQuery.parsePathNode() ).to.be.an( Error ) ;
	} ) ;
	
} ) ;



describe( "Slugify" , function() {
	
	it( "should slugify ASCII string" , function() {
		expect( restQuery.slugify( 'My wonderful blog' ) ).to.be.equal( 'my-wonderful-blog' ) ;
		expect( restQuery.slugify( 'My WoNdErful BloG' ) ).to.be.equal( 'my-wonderful-blog' ) ;
		expect( restQuery.slugify( '  My   WoNdErful   BloG  ' ) ).to.be.equal( 'my-wonderful-blog' ) ;
		expect( restQuery.slugify( '-My wonderful blog-' ) ).to.be.equal( 'my-wonderful-blog' ) ;
		expect( restQuery.slugify( 'ØMQ' ) ).to.be.equal( 'omq' ) ;
	} ) ;
	
	it( 'edge cases: slugified string that are valid ID/offset should have an hyphen appended' , function() {
		expect( restQuery.slugify( '51d18492541d2e3614ca2a80' ) ).to.be.equal( '51d18492541d2e3614ca2a80-' ) ;
		expect( restQuery.slugify( '51D18492541D2E3614CA2A80' ) ).to.be.equal( '51d18492541d2e3614ca2a80-' ) ;
		expect( restQuery.slugify( '123' ) ).to.be.equal( '123-' ) ;
	} ) ;
	
	it( 'edge cases: empty or too long strings' , function() {
		expect( restQuery.slugify( '' ) ).to.be.an( Error ) ;
		expect( restQuery.slugify( 'azekjsdlmfjqmsljdfmklqsdlmfjslmfvqsdmljfgqsdjgmklhsdmhqgfqsdlmghlmkdhfgaz' ) ).to.be.equal( 'azekjsdlmfjqmsljdfmklqsdlmfjslmfvqsdmljfgqsdjgmklhsdmhqgfqsdlmghlmkdhfga' ) ;
	} ) ;
	
	it( "when using slugify with options.symbols, it should convert symbols into supported language (ATM: en, fr)" , function() {
		expect( restQuery.slugify( '10€ le livre' ) ).to.be.equal( '10-le-livre' ) ;
		expect( restQuery.slugify( '10€ le livre' , { symbols: true } ) ).to.be.equal( '10-euro-le-livre' ) ;
		expect( restQuery.slugify( 'I ♥ NY' , { symbols: 'en' } ) ).to.be.equal( 'i-love-ny' ) ;
		expect( restQuery.slugify( "J'♥ Paris" , { symbols: 'fr' } ) ).to.be.equal( 'j-aime-paris' ) ;
	} ) ;
} ) ;



describe( "Parse HTTP request" , function() {
	
	it( "should parse a fake GET on /" , function( done ) {
		
		var req = fakeHttpRequest() ;
		
		restQuery.httpParser.parseRequest( req , function( error , message ) {
			
			expect( error ).not.to.be.ok() ;
			expect( message ).to.eql( {
				path: '/' ,
				type: 'json' ,
				host: 'localhost' ,
				method: 'get' ,
				params: {}
			} ) ;
			
			done() ;
		} ) ;
	} ) ;
	
	it( "should parse a fake GET with path and query string" , function( done ) {
		
		var req = fakeHttpRequest( { url: "/path/to.json?filter=on&id=123" } ) ;
		
		restQuery.httpParser.parseRequest( req , function( error , message ) {
			
			expect( error ).not.to.be.ok() ;
			expect( message ).to.eql( {
				path: '/path/to' ,
				type: 'json' ,
				host: 'localhost' ,
				method: 'get' ,
				params: { filter: 'on', id: '123' }
			} ) ;
			
			done() ;
		} ) ;
	} ) ;
	
	it( "should parse a fake POST with a body" , function( done ) {
		
		var req = fakeHttpRequest( { method: 'POST' } , '{"a":"simple","json":"file"}' ) ;
		
		restQuery.httpParser.parseRequest( req , function( error , message ) {
			
			expect( error ).not.to.be.ok() ;
			expect( message ).to.eql( {
				path: '/' ,
				type: 'json' ,
				host: 'localhost' ,
				method: 'post' ,
				params: {} ,
				data: { a: 'simple', json: 'file' }
			} ) ;
			
			done() ;
		} ) ;
	} ) ;
} ) ;
	


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
	
	it( "zzz" , function( done ) {
		
		var app = restQuery.createApp() ;
		
		var blogsNode = app.createCollectionNode( 'blogs' , blogsDescriptor ) ;
		var postsNode = app.createCollectionNode( 'posts' , postsDescriptor ) ;
		var commentsNode = app.createCollectionNode( 'comments' , commentsDescriptor ) ;
		
		app.root.contains( blogsNode ) ;
		blogsNode.contains( postsNode ) ;
		postsNode.contains( commentsNode ) ;
		
		//console.log( app ) ;
		
		var blog = blogsNode.collection.createDocument( {
			title: 'My wonderful life' ,
			description: 'This is a supa blog!'
		} ) ;
		
		var id = blog.$._id ;
		
		var performer = app.createPerformer() ;
		
		async.series( [
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
	
	it( "www" , function( done ) {
		
		var app = restQuery.createApp() ;
		
		var blogsNode = app.createCollectionNode( 'blogs' , blogsDescriptor ) ;
		var postsNode = app.createCollectionNode( 'posts' , postsDescriptor ) ;
		var commentsNode = app.createCollectionNode( 'comments' , commentsDescriptor ) ;
		
		app.root.contains( blogsNode ) ;
		blogsNode.contains( postsNode ) ;
		postsNode.contains( commentsNode ) ;
		
		var performer = app.createPerformer() ;
		
		//console.log( app ) ;
		
		async.series( [
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
	
	
} ) ;


