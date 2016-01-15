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
			"user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:32.0) Gecko/20100101 Firefox/32.0" ,
			"accept-language": "en-US,en;q=0.5" ,
			"connection": "keep-alive" ,
			"accept-encoding": "gzip, deflate" ,
			"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" ,
			"content-type": "application/json" ,
			"host": "localhost" ,
			"cache-control": "max-age=0"
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
	
	var parsePathNode = function parsePathNode( str ) {
		
		try {
			return restQuery.path.parseNode( str ) ;
		}
		catch ( error ) {
			return error ;
		}
	} ;
	
	it( "should parse a valid collection node as an collection's child of the current object" , function() {
		expect( parsePathNode( 'Users' ) ).to.eql( { type: 'collection' , identifier: 'users' } ) ;
		expect( parsePathNode( 'U' ) ).to.eql( { type: 'collection' , identifier: 'u' } ) ;
	} ) ;
	
	it( "should parse a valid method node as a method" , function() {
		expect( parsePathNode( 'REGENERATE-TOKEN' ) ).to.eql( { type: 'method' , identifier: 'regenerateToken' } ) ;
		expect( parsePathNode( 'FILE' ) ).to.eql( { type: 'method' , identifier: 'file' } ) ;
	} ) ;
	
	it( "should parse a valid offset node as an offset" , function() {
		expect( parsePathNode( '1258' ) ).to.eql( { type: 'offset' , identifier: 1258 } ) ;
		expect( parsePathNode( '01258' ) ).to.eql( { type: 'offset' , identifier: 1258 } ) ;
		expect( parsePathNode( '0' ) ).to.eql( { type: 'offset' , identifier: 0 } ) ;
		expect( parsePathNode( '000' ) ).to.eql( { type: 'offset' , identifier: 0 } ) ;
		
		// Invalid entries
		expect( parsePathNode( '000b' ).type ).not.to.be.equal( 'offset' ) ;
	} ) ;
	
	it( "should parse a valid range node as a range" , function() {
		expect( parsePathNode( '0-100' ) ).to.eql( { type: 'range' , min: 0 , max: 100 } ) ;
		expect( parsePathNode( '156-345' ) ).to.eql( { type: 'range' , min: 156 , max: 345 } ) ;
		
		// Invalid entries
		expect( parsePathNode( '12-13-15' ).type ).not.to.be.equal( 'range' ) ;
	} ) ;
	
	it( "should parse a valid ID node as an ID" , function() {
		expect( parsePathNode( '51d18492541d2e3614ca2a80' ) ).to.eql( { type: 'id' , identifier: '51d18492541d2e3614ca2a80' } ) ;
		expect( parsePathNode( 'a1d18492541d2e3614ca2a80' ) ).to.eql( { type: 'id' , identifier: 'a1d18492541d2e3614ca2a80' } ) ;
		expect( parsePathNode( 'aaaaaaaaaaaaaaaaaaaaaaaa' ) ).to.eql( { type: 'id' , identifier: 'aaaaaaaaaaaaaaaaaaaaaaaa' } ) ;
		expect( parsePathNode( '111111111111111111111111' ) ).to.eql( { type: 'id' , identifier: '111111111111111111111111' } ) ;
		
		// Invalid entries
		expect( parsePathNode( '51d18492541d2e3614ca2a8' ).type ).not.to.be.equal( 'id' ) ;
		expect( parsePathNode( '51d18492541d2e3614ca2a80a' ).type ).not.to.be.equal( 'id' ) ;
		expect( parsePathNode( '51d18492541h2e3614ca2a80' ).type ).not.to.be.equal( 'id' ) ;
	} ) ;
	
	it( "should parse a valid slugId node as a slugId" , function() {
		expect( parsePathNode( 'abc' ) ).to.eql( { type: 'slugId' , identifier: 'abc' } ) ;
		expect( parsePathNode( 'cronvel' ) ).to.eql( { type: 'slugId' , identifier: 'cronvel' } ) ;
		expect( parsePathNode( 'c20nv31' ) ).to.eql( { type: 'slugId' , identifier: 'c20nv31' } ) ;
		expect( parsePathNode( 'my-blog-entry' ) ).to.eql( { type: 'slugId' , identifier: 'my-blog-entry' } ) ;
		expect( parsePathNode( 'a-24-characters-long-sid' ) ).to.eql( { type: 'slugId' , identifier: 'a-24-characters-long-sid' } ) ;
		expect( parsePathNode( 'agaaaaaaaaaaaaaaaaaaaaaa' ) ).to.eql( { type: 'slugId' , identifier: 'agaaaaaaaaaaaaaaaaaaaaaa' } ) ;
		expect( parsePathNode( '01b' ) ).to.eql( { type: 'slugId' , identifier: '01b' } ) ;
		expect( parsePathNode( 'azekjsdlmfjqmsljdfmklqsdlmfjslmfvqsdmljfgqsdjgmklhsdmhqgfqsdlmghlmkdhfga' ) ).to.eql( { type: 'slugId' , identifier: 'azekjsdlmfjqmsljdfmklqsdlmfjslmfvqsdmljfgqsdjgmklhsdmhqgfqsdlmghlmkdhfga' } ) ;
		expect( parsePathNode( 'a' ) ).to.eql( { type: 'slugId' , identifier: 'a' } ) ;
		
		// Invalid entries
		expect( parsePathNode( 'afaaaaaaaaaaaaaaaaaaaaaa' ).type ).not.to.be.equal( 'slugId' ) ;
		expect( parsePathNode( 'my-Blog-entry' ) ).to.be.an( Error ) ;
		expect( parsePathNode( 'My-blog-entry' ) ).to.be.an( Error ) ;
		expect( parsePathNode( 'azekjsdlmfjqmsljdfmklqsdlmfjslmfvqsdmljfgqsdjgmklhsdmhqgfqsdlmghlmkdhfgaz' ) ).to.be.an( Error ) ;
	} ) ;
	
	it( "should parse a valid property node as a property of the current object" , function() {
		expect( parsePathNode( '.bob' ) ).to.eql( { type: 'property' , identifier: 'bob' } ) ;
		expect( parsePathNode( '.name' ) ).to.eql( { type: 'property' , identifier: 'name' } ) ;
		expect( parsePathNode( '.n' ) ).to.eql( { type: 'property' , identifier: 'n' } ) ;
		expect( parsePathNode( '.embedded.data' ) ).to.eql( { type: 'property' , identifier: 'embedded.data' } ) ;
		
		// Invalid entries
		expect( parsePathNode( '.' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '.embedded..data' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '.name.' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '.name..' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '..name' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '.embedded.data.' ) ).to.be.an( Error ) ;
	} ) ;
	
	it( "should parse a valid link property node as a link property of the current object" , function() {
		expect( parsePathNode( '~name' ) ).to.eql( { type: 'linkProperty' , identifier: 'name' } ) ;
		expect( parsePathNode( '~n' ) ).to.eql( { type: 'linkProperty' , identifier: 'n' } ) ;
		expect( parsePathNode( '~embedded.data' ) ).to.eql( { type: 'linkProperty' , identifier: 'embedded.data' } ) ;
		
		// Invalid entries
		expect( parsePathNode( '~' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '~.' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '~embedded..data' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '~name.' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '~name..' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '~.name' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '~~name' ) ).to.be.an( Error ) ;
		expect( parsePathNode( '~embedded.data.' ) ).to.be.an( Error ) ;
	} ) ;
	
	it( "edge cases" , function() {	
		expect( parsePathNode( 'U-' ) ).to.eql( { type: 'method' , identifier: 'u' } ) ;
		expect( parsePathNode( 'U---' ) ).to.eql( { type: 'method' , identifier: 'u' } ) ;
		expect( parsePathNode( '-U' ) ).to.be.an( Error ) ;
	} ) ;
} ) ;



describe( "Path pattern matching" , function() {
	
	var pathMatch = restQuery.path.match ;
	
	it( "Basic pattern matching" , function() {
		expect( pathMatch( '/Users' , '/Users' ) ).to.be.ok() ;
		expect( pathMatch( '/Users/' , '/Users' ) ).to.be.ok() ;
		expect( pathMatch( '/Users' , '/Users/' ) ).to.be.ok() ;
		expect( pathMatch( '/Users' , '/Group' ) ).not.to.be.ok() ;
		expect( pathMatch( '/Users/123456789012345678901234' , '/Users' ) ).not.to.be.ok() ;
		expect( pathMatch( '/Users' , '/Users/123456789012345678901234' ) ).not.to.be.ok() ;
		expect( pathMatch( '/Users/123456789012345678901234' , '/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/Users/12345678901234567890123a' , '/Users/123456789012345678901234' ) ).not.to.be.ok() ;
		expect( pathMatch( '/Board/123456789012345678901234/Users/123456789012345678901234' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/Board/12345678901234567890123a/Users/123456789012345678901234' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).not.to.be.ok() ;
	} ) ;
	
	it( "Pattern matching with the '*' wildcard" , function() {
		expect( pathMatch( '/Board/*/Users/123456789012345678901234' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/Board/*/Users/*' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/Board/*/*/*' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/Board/123456789012345678901234/*' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).not.to.be.ok() ;
		expect( pathMatch( '/Board/123456789012345678901234/Users/*' , '/Board/123456789012345678901234/Users' ) ).not.to.be.ok() ;
	} ) ;
	
	it( "Pattern matching with the '...' wildcard" , function() {
		expect( pathMatch( '/Board/123456789012345678901234/Users/...' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/Board/123456789012345678901234/...' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/Board/123456789012345678901234/Users/123456789012345678901234/...' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).not.to.be.ok() ;
	} ) ;
	
	it( "Pattern matching with the '[id]' wildcard" , function() {
		expect( pathMatch( '/Board/[id]/Users/123456789012345678901234' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/Board/[id]/Users/[id]' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/Board/123456789012345678901234/[id]/123456789012345678901234' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).not.to.be.ok() ;
		expect( pathMatch( '/[id]/123456789012345678901234/Users/123456789012345678901234' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).not.to.be.ok() ;
	} ) ;
	
	it( "Pattern matching with the '[collection]' wildcard" , function() {
		expect( pathMatch( '/Board/123456789012345678901234/[collection]/123456789012345678901234' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/[collection]/123456789012345678901234/Users/123456789012345678901234' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/[collection]/123456789012345678901234/[collection]/123456789012345678901234' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).to.be.ok() ;
		expect( pathMatch( '/Board/[collection]/Users/123456789012345678901234' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).not.to.be.ok() ;
		expect( pathMatch( '/Board/[collection]/Users/[collection]' , '/Board/123456789012345678901234/Users/123456789012345678901234' ) ).not.to.be.ok() ;
	} ) ;
} ) ;

	

describe( "Parse HTTP request" , function() {
	
	it( "should parse a fake GET on /" , function( done ) {
		
		var req = fakeHttpRequest() ;
		
		restQuery.httpModule.parseRequest( req , function( error , message ) {
			
			expect( error ).not.to.be.ok() ;
			expect( message ).to.eql( {
				//path: '/' ,
				path: [] ,
				//type: 'json' ,
				host: 'localhost' ,
				method: 'get' ,
				query: {}
			} ) ;
			
			done() ;
		} ) ;
	} ) ;
	
	it( "should parse a fake GET with path and query string" , function( done ) {
		
		var req = fakeHttpRequest( { url: "/path/to/json?populate=group" } ) ;
		
		restQuery.httpModule.parseRequest( req , function( error , message ) {
			
			expect( error ).not.to.be.ok() ;
			expect( message ).to.eql( {
				//path: '/path/to/json' ,
				path: [
					{
						identifier: "path" ,
						type: "slugId"
					} ,
					{
						identifier: "to" ,
						type: "slugId"
					} ,
					{
						identifier: "json" ,
						type: "slugId"
					}
				] ,
				//type: 'json' ,
				host: 'localhost' ,
				method: 'get' ,
				query: { populate: 'group' }
			} ) ;
			
			done() ;
		} ) ;
	} ) ;
	
	it( "should parse a fake POST with a body" , function( done ) {
		
		var req = fakeHttpRequest( { method: 'POST' } , '{"a":"simple","json":"file"}' ) ;
		
		restQuery.httpModule.parseRequest( req , function( error , message ) {
			
			expect( error ).not.to.be.ok() ;
			expect( message ).to.eql( {
				//path: '/' ,
				path: [] ,
				//type: 'json' ,
				host: 'localhost' ,
				method: 'post' ,
				query: {} ,
				data: { a: 'simple', json: 'file' }
			} ) ;
			
			done() ;
		} ) ;
	} ) ;
	
	it( "Content-Type: application/x-www-form-urlencoded support test" ) ;
} ) ;


