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
"use strict" ;

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = restQuery.log.global.use( 'users-methods' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	changeFirstName: async function( context ) {
		
		//log.fatal( '>>>>>>>>>> changeFirstName, context: %I \n\nTHIS:\n%I\n' , arguments , this ) ;
		
		if ( ! context.input.document ) {
			context.output.data = { done: "nothing" , cause: "this is a GET request" } ;
		}
		else if ( context.input.document.firstName ) {
			await this.object.patch( { firstName: context.input.document.firstName } ) ;
			await this.object.commit() ;
			context.output.data = { done: "something" , to: this.object } ;
			
		}
		else {
			context.output.data = { done: "nothing" , to: this.object } ;
		}
	}
} ;
