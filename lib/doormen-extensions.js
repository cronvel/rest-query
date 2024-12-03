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



const doormen = require( 'doormen' ) ;
const crypto = require( 'crypto' ) ;

const restQuery = require( './restQuery.js' ) ;



doormen.extendTypeCheckers( {
	"restQuery.slug": data => {
		// Old validator:
		//if ( typeof data !== 'string' || data.length < 2 || data.length > 72 ) { return false ; }
		//return /^[a-z0-9-]+$/.test( data ) ;

		// We use 144 as length limit instead of 72 because of unicode surrogate pairs, the 72-chars limit is enforced by the RegExp
		// Also the RegExp allow single chars, this is because some 2-bytes chars are ideogram, and can represent whole words
		if ( typeof data !== 'string' || data.length < 2 || data.length > 144 ) { return false ; }
		return /^[\p{Ll}\p{Lm}\p{Lo}\p{N}\p{M}-]{1,72}$/u.test( data ) ;
	} ,
	"restQuery.hid": data => data && typeof data === 'string' ,
	"restQuery.accessDetail": data => {
		if ( typeof data === 'boolean' ) { return true ; }
		if ( typeof data === 'boolean' ) { return true ; }
		if ( ! Array.isArray( data ) ) { return false ; }
		return data.every( e => typeof e === 'string' ) ;
	}
} ) ;



doormen.extendSanitizers( {
	// Create a random slug for restQuery
	"restQuery.randomSlug": data => {
		if ( data !== undefined && data !== null ) { return data ; }
		return Date.now().toString( 36 ) + '-' + crypto.pseudoRandomBytes( 4 ).readUInt32LE( 0 , true )
			.toString( 36 ) ;
	} ,
	"restQuery.toHid": data => '' + data ,
	// Transform string to "access" object
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
				return {
					traverse: true ,
					read: [ 'id' , 'content' , 'systemContent' ] ,
					exec: [ 'id' , 'content' ] ,
					query: true
				} ;
			case 'readCreate' :
				return {
					traverse: true ,
					read: [ 'id' , 'content' , 'systemContent' ] ,
					exec: [ 'id' , 'content' ] ,
					query: true ,
					create: true
				} ;
			case 'readCreateModify' :
				return {
					traverse: true ,
					read: [ 'id' , 'content' , 'systemContent' ] ,
					write: [ 'id' , 'content' ] ,
					exec: [ 'id' , 'content' ] ,
					query: true ,
					create: true
				} ;
			case 'readCreateModifyReplace' :
				return {
					traverse: true ,
					read: [ 'id' , 'content' , 'systemContent' ] ,
					write: [ 'id' , 'content' ] ,
					overwrite: true ,
					exec: [ 'id' , 'content' ] ,
					query: true ,
					create: true
				} ;
			case 'all' :
				return {
					traverse: true ,
					read: true ,
					write: true ,
					overwrite: true ,
					delete: true ,
					exec: true ,
					query: true ,
					create: true
				} ;
			default :
				return data ;
		}
	} ,

	// Transform string to "access" object
	"restQuery.toCollectionAccess": data => {
		if ( typeof data !== 'string' ) { return data ; }

		// Those string are shorthand access type
		switch ( data ) {
			case 'none' :
				return {} ;
			case 'traverse' :
			case 'passThrough' :
				return { traverse: true } ;
			case 'all' :
				return {
					traverse: true , exec: true , query: true , create: true
				} ;
			default :
				return data ;
		}
	} ,

	// Sanitize access details
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

