/*
	Rest Query
	
	Copyright (c) 2014 - 2016 Cédric Ronvel
	
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

"use strict" ;



var doormen = require( 'doormen' ) ;
var kungFig = require( 'kung-fig' ) ;
var string = require( 'string-kit' ) ;

// restQuery will extend doormen, so it should be loaded
var restQuery = require( '../lib/restQuery.js' ) ;	// jshint ignore:line



describe( "doormen's restQuery specific" , function() {

	it( "restQuery.slug type checker" , function() {
		
		doormen( { type: 'restQuery.slug' } , 'my-slug' ) ;
		doormen.not( { type: 'restQuery.slug' } , 'Not-a-slug' ) ;
	} ) ;
	
	it( "restQuery.randomSlug sanitizer" , function() {
		
		var slug = doormen( { type: 'restQuery.slug' , sanitize: 'restQuery.randomSlug' } , null ) ;
		//console.log( slug ) ;
	} ) ;
} ) ;


describe( "KFG and JSON conformance" , function() {

	it( "KFG and JSON should create the same config" , function() {
		var kfg = kungFig.load( __dirname + '/../sample.kfg/main.kfg' ) ;
		//console.error( JSON.stringify( kfg , null , '\t' ) ) ;
		console.error( string.inspect( {style:'color',depth: 10} , kfg ) ) ;
		
		var json = kungFig.load( __dirname + '/../sample.json/main.json' ) ;
		//console.error( JSON.stringify( json , null , '\t' ) ) ;
		console.error( string.inspect( {style:'color',depth: 10} , json ) ) ;
		
		doormen.equals( JSON.stringify( kfg ) , JSON.stringify( json ) ) ;
		//doormen.equals( kfg , json ) ;
		return ;
	} ) ;
} ) ;
