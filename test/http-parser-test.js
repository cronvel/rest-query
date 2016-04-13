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

"use strict" ;



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
				tier: 3 ,
				pTier: 3 ,
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
						node: "path" ,
						type: "slugId"
					} ,
					{
						identifier: "to" ,
						node: "to" ,
						type: "slugId"
					} ,
					{
						identifier: "json" ,
						node: "json" ,
						type: "slugId"
					}
				] ,
				//type: 'json' ,
				host: 'localhost' ,
				method: 'get' ,
				tier: 3 ,
				pTier: 3 ,
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
				tier: 3 ,
				pTier: 3 ,
				query: {} ,
				data: { a: 'simple', json: 'file' }
			} ) ;
			
			done() ;
		} ) ;
	} ) ;
	
	it( "Content-Type: application/x-www-form-urlencoded support test" ) ;
} ) ;


