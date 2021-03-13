/*
	Rest Query

	Copyright (c) 2014 - 2021 Cédric Ronvel

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



const restQuery = require( '..' ) ;

const tree = require( 'tree-kit' ) ;
const stream = require( 'stream' ) ;
const server = require( 'server-kit' ) ;



// Utils

// r: httpRequest part that overwrite defaults
// body: the faked body
function fakeHttpClient( r = {} , body = '' ) {
	//var req = stream.Duplex() ;
	var req = stream.PassThrough() ;

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

	if ( body.length ) {
		req.write( body ) ;
		req.headers['content-length'] = '' + body.length ;
	}

	req.end() ;

	return new server.Client( null , {
		request: req ,
		queryParserOptions: restQuery.HttpModule.queryParserOptions
	} ) ;
}



describe( "Parse HTTP request" , () => {
	
	it( "should parse a fake GET on /" , async () => {
		var req = fakeHttpClient() ;
		var httpModule = new restQuery.HttpModule() ;
		var message = await httpModule.parseRequest( req ) ;
		
		expect( message ).to.equal( {
			//path: '/' ,
			path: [] ,
			//type: 'json' ,
			host: 'localhost' ,
			method: 'get' ,
			query: {
				//limit: 1000
			}
		} ) ;
	} ) ;

	it( "should parse a fake GET with path and query string" , async () => {
		var req = fakeHttpClient( { url: "/path/to/json?populate=group&.prop.$lt=20&.prop.$gt=10&.prop2=bob&search=toto" } ) ;
		var httpModule = new restQuery.HttpModule() ;
		var message = await httpModule.parseRequest( req ) ;
		
		expect( message ).to.equal( {
			//path: '/path/to/json' ,
			path: [
				{
					identifier: "path" ,
					isCollection: false ,
					isDocument: true ,
					value: "path" ,
					unicode: false ,
					type: "slugId"
				} ,
				{
					identifier: "to" ,
					isCollection: false ,
					isDocument: true ,
					value: "to" ,
					unicode: false ,
					type: "slugId"
				} ,
				{
					identifier: "json" ,
					isCollection: false ,
					isDocument: true ,
					value: "json" ,
					unicode: false ,
					type: "slugId"
				}
			] ,
			//type: 'json' ,
			host: 'localhost' ,
			method: 'get' ,
			query: {
				//limit: 1000 ,
				populate: [ 'group' ] ,
				filter: {
					prop: { $lt: 20 , $gt: 10 } ,
					prop2: "bob"
				} ,
				search: 'toto'
			}
		} ) ;
	} ) ;

	it( "should parse a fake POST with a body" , async () => {
		var req = fakeHttpClient( { method: 'POST' } , '{"a":"simple","json":"file"}' ) ;
		var httpModule = new restQuery.HttpModule() ;
		var message = await httpModule.parseRequest( req ) ;
		
		expect( message ).to.equal( {
			//path: '/' ,
			path: [] ,
			//type: 'json' ,
			host: 'localhost' ,
			method: 'post' ,
			query: {
				//limit: 1000
			} ,
			data: { a: 'simple', json: 'file' }
		} ) ;
	} ) ;

	it( "Content-Type: application/x-www-form-urlencoded support test" ) ;
} ) ;

