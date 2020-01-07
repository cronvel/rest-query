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



const restQuery = require( '../../lib/restQuery.js' ) ;
const log = restQuery.log.global.use( 'blogs-hooks' ) ;

const Promise = require( 'seventh' ) ;



module.exports = {
	
	beforeCreate: async function( context ) {
		if ( context.input.query.activateBeforeCreate ) {
			context.hook.incomingDocument.secret = context.input.query.activateBeforeCreate ;
			context.usr.beforeCreateContext = Object.assign( {} , context ) ;
			// Because it is cleared to avoid creating tons of objects
			context.usr.beforeCreateContext.hook = Object.assign( {} , context.hook ) ;
		}
	} ,
	
	afterCreate: async function( context ) {
		if ( context.input.query.activateAfterCreate ) {
			context.usr.afterCreateContext = Object.assign( {} , context ) ;
			// Because it is cleared to avoid creating tons of objects
			context.usr.afterCreateContext.hook = Object.assign( {} , context.hook ) ;
		}
	} ,
	
	beforeModify: function( context ) {
		log.debug( '>>>>>>>>>> beforeModify, context: %Y' , context ) ;
		
		return context.performer.getUser().then( user => {
			log.debug( '>>>>>>>>>> beforeModify, user: %Y' , user ) ;
		} ) ;
	} ,
	
	beforeDelete: function( context ) {
		log.debug( '>>>>>>>>>> beforeDelete, context: %[l50000]Y' , context ) ;
		
		return context.performer.getUser().then( user => {
			log.debug( '>>>>>>>>>> beforeDelete, user: %Y' , user ) ;
		} ) ;
	}
} ;

