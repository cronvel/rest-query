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

var tree = require( 'tree-kit' ) ;
var stream = require( 'stream' ) ;
var expect = require( 'expect.js' ) ;





			/* Utils */



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



describe( "Path's node parsing" , function() {
	
	it( "should parse a valid property node as an property of the current object" , function() {
		expect( restQuery.Node.parsePathNode( 'Users' ) ).to.be.eql( { type: 'member' , identifier: 'users' } ) ;
		
		// Invalid entries
		expect( restQuery.Node.parsePathNode( 'U-' ) ).to.be.an( Error ) ;
	} ) ;
	
	it( "should parse a valid offset node as an offset" , function() {
		expect( restQuery.Node.parsePathNode( '1258' ) ).to.be.eql( { type: 'offset' , identifier: 1258 } ) ;
		expect( restQuery.Node.parsePathNode( '01258' ) ).to.be.eql( { type: 'offset' , identifier: 1258 } ) ;
		expect( restQuery.Node.parsePathNode( '0' ) ).to.be.eql( { type: 'offset' , identifier: 0 } ) ;
		expect( restQuery.Node.parsePathNode( '000' ) ).to.be.eql( { type: 'offset' , identifier: 0 } ) ;
		
		// Invalid entries
		expect( restQuery.Node.parsePathNode( '000b' ).type ).not.to.be.equal( 'offset' ) ;
	} ) ;
	
	it( "should parse a valid ID node as an ID" , function() {
		expect( restQuery.Node.parsePathNode( '51d18492541d2e3614ca2a80' ) ).to.be.eql( { type: 'ID' , identifier: '51d18492541d2e3614ca2a80' } ) ;
		expect( restQuery.Node.parsePathNode( 'a1d18492541d2e3614ca2a80' ) ).to.be.eql( { type: 'ID' , identifier: 'a1d18492541d2e3614ca2a80' } ) ;
		expect( restQuery.Node.parsePathNode( 'aaaaaaaaaaaaaaaaaaaaaaaa' ) ).to.be.eql( { type: 'ID' , identifier: 'aaaaaaaaaaaaaaaaaaaaaaaa' } ) ;
		expect( restQuery.Node.parsePathNode( '111111111111111111111111' ) ).to.be.eql( { type: 'ID' , identifier: '111111111111111111111111' } ) ;
		
		// Invalid entries
		expect( restQuery.Node.parsePathNode( '51d18492541d2e3614ca2a8' ).type ).not.to.be.equal( 'ID' ) ;
		expect( restQuery.Node.parsePathNode( '51d18492541d2e3614ca2a80a' ).type ).not.to.be.equal( 'ID' ) ;
		expect( restQuery.Node.parsePathNode( '51d18492541h2e3614ca2a80' ).type ).not.to.be.equal( 'ID' ) ;
	} ) ;
	
	it( "should parse a valid SID node as a SID" , function() {
		expect( restQuery.Node.parsePathNode( 'abc' ) ).to.be.eql( { type: 'SID' , identifier: 'abc' } ) ;
		expect( restQuery.Node.parsePathNode( 'cronvel' ) ).to.be.eql( { type: 'SID' , identifier: 'cronvel' } ) ;
		expect( restQuery.Node.parsePathNode( 'c20nv31' ) ).to.be.eql( { type: 'SID' , identifier: 'c20nv31' } ) ;
		expect( restQuery.Node.parsePathNode( 'my-blog-entry' ) ).to.be.eql( { type: 'SID' , identifier: 'my-blog-entry' } ) ;
		expect( restQuery.Node.parsePathNode( 'a-24-characters-long-sid' ) ).to.be.eql( { type: 'SID' , identifier: 'a-24-characters-long-sid' } ) ;
		expect( restQuery.Node.parsePathNode( 'agaaaaaaaaaaaaaaaaaaaaaa' ) ).to.be.eql( { type: 'SID' , identifier: 'agaaaaaaaaaaaaaaaaaaaaaa' } ) ;
		expect( restQuery.Node.parsePathNode( '01b' ) ).to.be.eql( { type: 'SID' , identifier: '01b' } ) ;
		expect( restQuery.Node.parsePathNode( 'azekjsdlmfjqmsljdfmklqsdlmfjslmfvqsdmljfgqsdjgmklhsdmhqgfqsdlmghlmkdhfga' ) ).to.be.eql( { type: 'SID' , identifier: 'azekjsdlmfjqmsljdfmklqsdlmfjslmfvqsdmljfgqsdjgmklhsdmhqgfqsdlmghlmkdhfga' } ) ;
		
		// Invalid entries
		expect( restQuery.Node.parsePathNode( 'aa' ) ).to.be.an( Error ) ;
		expect( restQuery.Node.parsePathNode( 'afaaaaaaaaaaaaaaaaaaaaaa' ).type ).not.to.be.equal( 'SID' ) ;
		expect( restQuery.Node.parsePathNode( 'my-Blog-entry' ) ).to.be.an( Error ) ;
		expect( restQuery.Node.parsePathNode( 'My-blog-entry' ) ).to.be.an( Error ) ;
		expect( restQuery.Node.parsePathNode( 'aa' ) ).to.be.an( Error ) ;
		expect( restQuery.Node.parsePathNode( 'azekjsdlmfjqmsljdfmklqsdlmfjslmfvqsdmljfgqsdjgmklhsdmhqgfqsdlmghlmkdhfgaz' ) ).to.be.an( Error ) ;
	} ) ;
	
	it( "should handle edge cases correctly" , function() {
		expect( restQuery.Node.parsePathNode( '' ) ).to.be.an( Error ) ;
		expect( restQuery.Node.parsePathNode() ).to.be.an( Error ) ;
	} ) ;
	
} ) ;



describe( "Parse HTTP request" , function() {
	
	it( "should parse a fake GET on /" , function( done ) {
		
		var req = fakeHttpRequest() ;
		
		restQuery.httpModule.parseRequest( req , function( error , message ) {
			
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
		
		restQuery.httpModule.parseRequest( req , function( error , message ) {
			
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
		
		restQuery.httpModule.parseRequest( req , function( error , message ) {
			
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


