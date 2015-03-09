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
var expect = require( 'expect.js' ) ;





			/* Tests */



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

