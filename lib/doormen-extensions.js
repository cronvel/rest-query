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



const doormen = require( 'doormen' ) ;
const crypto = require( 'crypto' ) ;

const restQuery = require( './restQuery.js' ) ;



doormen.extendTypeChecker( {
	"restQuery.slug": data => {
		if ( typeof data !== 'string' || data.length < 2 || data.length > 72 ) { return false ; }
		return /^[a-z0-9-]+$/.test( data ) ;
	} ,
	"restQuery.accessDetail": data => {
		if ( typeof data === 'boolean' ) { return true ; }
		if ( typeof data === 'boolean' ) { return true ; }
		if ( ! Array.isArray( data ) ) { return false ; }
		return data.every( e => typeof e === 'string' ) ;
	}
} ) ;



doormen.extendSanitizer( {
	// Create a random slug for restQuery
	"restQuery.randomSlug": data => {
		if ( data !== undefined && data !== null ) { return data ; }
		return Date.now().toString( 36 ) + '-' + crypto.pseudoRandomBytes( 4 ).readUInt32LE( 0 , true )
			.toString( 36 ) ;
	} ,
	// Create a random slug for restQuery
	"restQuery.toAccess": data => {
		if ( typeof data !== 'string' ) { return data ; }

		// Those string are shorthand access type
		switch ( data ) {
			case 'none' :
				return {} ;
			case 'traverse' :
			case 'passThrough' :
				return { traverse: true } ;
			case 'read' :
				return { traverse: true , read: [ 'id' , 'content' ] } ;
			case 'readCreate' :
				return { traverse: true , read: [ 'id' , 'content' ] , create: true } ;
			case 'readCreateModify' :
				return {
					traverse: true , read: [ 'id' , 'content' ] , write: [ 'id' , 'content' ] , create: true
				} ;
			case 'readCreateModifyReplace' :
				return {
					traverse: true , read: [ 'id' , 'content' ] , write: [ 'id' , 'content' ] , overwrite: true , create: true
				} ;
			case 'all' :
				return {
					traverse: true , read: true , write: true , overwrite: true , delete: true , create: true
				} ;
			default :
				return data ;
		}
	} ,
	// Create a random slug for restQuery
	"restQuery.toAccessDetail": data => {
		if ( typeof data === 'boolean' ) { return data ; }


		if ( typeof data === 'string' ) {
			// Alternate string
			switch ( data ) {
				case 'none' :
					return false ;
				case 'all' :
					return true ;
			}

			data = [ data ] ;
		}

		if ( Array.isArray( data ) ) {
			if ( data.length && ! data.includes( 'id' ) ) {
				data.unshift( 'id' ) ;
			}

			return data ;
		}

		return data ;
	}
} ) ;

