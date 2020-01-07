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



const log = require( 'logfella' ).global.use( 'rest-query' ) ;



exports.schema = {
	type: 'array' ,
	optional: true ,
	sanitize: 'toArray' ,
	of: { type: 'function' }
} ;



exports.run = async function( arrayOfHooks , context , hookContext = null ) {
	var hook ;

	if ( hookContext ) {
		context.hook = hookContext ;
	}
	else if ( context.hook ) {
		for ( let key in context.hook ) { delete context.hook[ key ] ; }
	}
	else {
		context.hook = {} ;
	}

	for ( hook of arrayOfHooks ) {
		await hook( context ) ;
		if ( context.done ) { return ; }
	}
} ;



exports.runAfter = async function( arrayOfHooks , context , hookContext = null ) {
	var hook ;

	if ( hookContext ) {
		context.hook = hookContext ;
	}
	else if ( context.hook ) {
		for ( let key in context.hook ) { delete context.hook[ key ] ; }
	}
	else {
		context.hook = {} ;
	}

	try {
		for ( hook of arrayOfHooks ) {
			await hook( context ) ;
			if ( context.done ) { return ; }
		}
	}
	catch ( error ) {
		log.error( "The hook failed, but the request had already succeeded: %E" , error ) ;
		// Send 200/201 anyway?
		return context ;
	}
} ;
