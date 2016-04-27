/*
	The Cedric's Swiss Knife (CSK) - CSK REST Query

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

"use strict" ;



var doormen = require( 'doormen' ) ;
var crypto = require( 'crypto' ) ;



var restQuery = require( './restQuery.js' ) ;



doormen.extendTypeChecker( {
	
	"restQuery.slug": function restQuerySlug( data ) {
		if ( typeof data !== 'string' || data.length < 2 || data.length > 72 ) { return false ; }
		return /^[a-z0-9-]+$/.test( data ) ;
	}
} ) ;



doormen.extendSanitizer( {
	
	// Create a random slug for restQuery
	"restQuery.randomSlug": function restQueryRandomSlug( data ) {
		if ( data !== undefined && data !== null ) { return data ; }
		return Date.now().toString( 36 ) + '-' + crypto.pseudoRandomBytes( 4 ).readUInt32LE( 0 , true ).toString( 36 ) ;
	} ,
	// Create a random slug for restQuery
	"restQuery.toAccess": function restQueryToAccess( data ) {
		if ( typeof data !== 'string' ) { return data ; }
		
		// Those string are legacy access type, available in restQuery up to v0.16.x
		switch ( data )
		{
			case 'none':
				return {} ;
			case 'traverse':
			case 'passThrough':
				return { traverse: 1 } ;
			case 'read':
				return { traverse: 1 , read: 3 } ;
			case 'readCreate':
				return { traverse: 1 , read: 3 , create: 1 } ;
			case 'readCreateModify':
				return { traverse: 1 , read: 4 , write: 4 , create: 1 } ;
			case 'readCreateModifyReplace':
				return { traverse: 1 , read: 4 , write: 4 , delete: 1 , create: 1 } ;
			case 'all':
				return { traverse: 1 , read: 5 , write: 5 , delete: 1 , create: 1 } ;
			default:
				return data ;
		}
	}
} ) ;


