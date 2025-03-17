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



const jsonKit = require( 'json-kit' ) ;
const tree = require( 'tree-kit' ) ;
const string = require( 'string-kit' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;

const serializers = {} ;
module.exports = serializers ;


serializers.toJson = JSON.stringify ;
serializers.toJsonDocumentDepth = jsonKit.stringifier( { documentDepth: 2 } ) ;
serializers.toJsonMask = jsonKit.stringifier( { propertyMask: true } ) ;
serializers.toJsonMaskAndDocumentDepth = jsonKit.stringifier( { propertyMask: true , documentDepth: 2 } ) ;
serializers.toJsonLocalEnumerate = jsonKit.stringifier( { localEnumerate: true } ) ;
serializers.toJsonLocalEnumerateAndDocumentDepth = jsonKit.stringifier( { localEnumerate: true , documentDepth: 2 } ) ;

serializers.toJsonLocalEnumerateAndDocumentDepth = jsonKit.stringifier( { localEnumerate: true , documentDepth: 2 } ) ;



serializers.toCsvHeader = ( params ) =>
	( params.bom ? "\ufeff" : '' )	// BOM for this shitty Microsoft Excel, still not capable to work with UTF-8 in 2025
	//( params.bom ? "\xef\xbb\xbf" : '' )	// BOM for this shitty Microsoft Excel, still not capable to work with UTF-8 in 2025
	+ params.columns.map( column => serializers.toCsvValue( column.name , null , params ) ).join( params.separator || ',' ) + '\r\n' ;

serializers.toCsvLine = ( data , params ) => params.columns.map( column => {
	var value , path , paths ;

	if ( column.query && column.queryPath ) {
		let searchArray = tree.dotPath.get( data , column.queryPath ) ;
		//log.hdebug( "Has query %I %I %I" , column , column.queryPath , searchArray ) ;

		if ( Array.isArray( searchArray ) ) {
			//log.hdebug( "Has search array" ) ;
			let index = searchArray.findIndex( element => {
				for ( let key of Object.keys( column.query ) ) {
					if ( column.query[ key ] !== element[ key ] ) { return false ; }
				}

				return true ;
			} ) ;

			//log.hdebug( "Find index: %f" , index ) ;
			if ( index !== -1 ) {
				path = column.queryPath + '.' + index ;

				if ( column.format && column.subPaths ) {
					paths = column.subPaths.map( sp => path + '.' + sp ) ;
				}
				else if ( column.subPath ) {
					path += '.' + column.subPath ;
				}
				//log.hdebug( "Query Path: %s" , path ) ;
			}
		}
	}
	else {
		path = column.path ;
	}

	if ( column.format && paths ) {
		value = string.format( column.format , ... paths.map( p => tree.dotPath.get( data , p ) ) ) ;
	}
	else if ( path ) {
		value = tree.dotPath.get( data , path ) ;
	}

	return serializers.toCsvValue( value , column , params ) ;
} ).join( params.separator || ',' ) + '\r\n' ;

serializers.toCsvValue = ( value , column , params ) => {
	if (
		column?.forceType && typeof value !== column.forceType
		&& ! ( column.forceTypeIfNotNull && ( value === undefined || value === null ) )
	) {
		switch ( column.forceType ) {
			case 'string' :
				value = '' + value ;
				break ;
			case 'number' :
				value = + value || 0 ;
				break ;
			case 'boolean' :
				value = ! ( ! value || value === '0' || value === 'false' || value === 'null' ) ;
				break ;
			case 'date' :
				if ( ! ( value instanceof Date ) ) { value = new Date( value ) ; }

				try {
					value = value.toLocaleDateString( params.locale || 'en-US' ) ;
				}
				catch ( error ) {
					value = value.toLocaleDateString( 'en-US' ) ;
				}
				break ;
			case 'datetime' :
				if ( ! ( value instanceof Date ) ) { value = new Date( value ) ; }

				try {
					value = value.toLocaleString( params.locale || 'en-US' ) ;
				}
				catch ( error ) {
					value = value.toLocaleString( 'en-US' ) ;
				}
				break ;
		}
	}

	if ( value === undefined ) { return '' ; }

	if ( typeof value === 'string' ) {
		if ( value && csvFieldIsRequiringQuote( value ) ) { return csvQuoteString( value ) ; }
		return value ;
	}

	if ( typeof value === 'number' ) {
		if ( Number.isFinite( value ) ) { return '' + value ; }
		return '"' + value + '"' ;
	}

	if ( typeof value === 'boolean' ) {
		return value ? '1' : '0' ;
	}

	if ( value ) {
		return csvQuoteString( JSON.stringify( value ) ) ;
	}

	return '' ;
} ;

const csvFieldIsRequiringQuote = str => {
	for ( let c of str ) {
		if ( c === ',' || c === ';' || c === '"' || c === ' ' || c === '\r' || c === '\n' || c === '\t' ) {
			return true ;
		}
	}

	return false ;
} ;

const csvQuoteString = str => '"' + str.replace( /"/g , '""' ) + '"'  ;

