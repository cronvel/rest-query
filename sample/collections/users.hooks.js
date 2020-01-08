/*
	Rest Query

	Copyright (c) 2014 - 2020 Cédric Ronvel

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
var log = restQuery.log.global.use( 'users-hooks' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	beforeCreate: function( context ) {
		log.debug( '>>>>>>>>>> beforeCreate, context: %I' , context ) ;
		
		if ( ! context.hook.incomingDocument.login ) { context.hook.incomingDocument.login = context.hook.incomingDocument.email ; }
		
		if ( ! context.hook.incomingDocument.slugId ) {
			context.hook.incomingDocument.slugId = restQuery.slugify( context.hook.incomingDocument.firstName + '-' + context.hook.incomingDocument.lastName ) ;
		}
		
		return context.performer.getUser().then( user => {
			log.debug( '>>>>>>>>>> beforeCreate, user: %I' , user ) ;
		} ) ;
	} ,

	beforeCreateToken: async ( context ) => {
		if ( context.usr.beforeCreateTokenTest ) { await context.usr.beforeCreateTokenTest( context ) ; }
	} ,
	
	afterCreateToken: async ( context ) => {
		if ( context.usr.afterCreateTokenTest ) { await context.usr.afterCreateTokenTest( context ) ; }
	}
} ;

