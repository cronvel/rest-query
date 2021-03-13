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

"use strict" ;



const restQuery = require( '../../lib/restQuery.js' ) ;
const log = restQuery.log.global.use( 'blogs-hooks' ) ;

const Promise = require( 'seventh' ) ;



module.exports = {
	
	beforeCreate: [
		async ( context ) => {
			if ( context.usr.beforeCreatePreHookTest ) { await context.usr.beforeCreatePreHookTest( context ) ; }
			if ( context.usr.beforeCreatePreHookDone ) { context.done() ; }
		} ,
		async ( context ) => {
			if ( context.usr.beforeCreateTest ) { await context.usr.beforeCreateTest( context ) ; }
		}
	] ,
	
	afterCreate: async ( context ) => {
		if ( context.usr.afterCreateTest ) { await context.usr.afterCreateTest( context ) ; }
	} ,
	
	beforeModify: async ( context ) => {
		if ( context.usr.beforeModifyTest ) { await context.usr.beforeModifyTest( context ) ; }
	} ,
	
	afterModify: async ( context ) => {
		if ( context.usr.afterModifyTest ) { await context.usr.afterModifyTest( context ) ; }
	} ,

	beforeDelete: async ( context ) => {
		if ( context.usr.beforeDeleteTest ) { await context.usr.beforeDeleteTest( context ) ; }
	} ,
	
	afterDelete: async ( context ) => {
		if ( context.usr.afterDeleteTest ) { await context.usr.afterDeleteTest( context ) ; }
	} ,

	search: async ( context ) => {
		if ( context.usr.searchTest ) { await context.usr.searchTest( context ) ; }
	}
} ;

