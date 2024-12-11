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

const serializers = {} ;
module.exports = serializers ;


serializers.toJson = JSON.stringify ;
serializers.toJsonDocumentDepth = jsonKit.stringifier( { documentDepth: 2 } ) ;
serializers.toJsonMask = jsonKit.stringifier( { propertyMask: true } ) ;
serializers.toJsonMaskAndDocumentDepth = jsonKit.stringifier( { propertyMask: true , documentDepth: 2 } ) ;
serializers.toJsonLocalEnumerate = jsonKit.stringifier( { localEnumerate: true } ) ;
serializers.toJsonLocalEnumerateAndDocumentDepth = jsonKit.stringifier( { localEnumerate: true , documentDepth: 2 } ) ;

serializers.toJsonLocalEnumerateAndDocumentDepth = jsonKit.stringifier( { localEnumerate: true , documentDepth: 2 } ) ;



serializers.toCsvHeader = ( params ) => params.columns.map( column => serializers.toCsvValue( column.name ) ) + '\r\n' ;
serializers.toCsvLine = ( data , params ) => params.columns.map( column => serializers.toCsvValue( tree.dotPath.get( data , column.path ) , column ) ) + '\r\n' ;

serializers.toCsvValue = ( value , column ) => {
	if ( typeof value === 'string' ) {
		if ( value && csvFieldIsRequiringQuote( value ) ) { return csvQuoteString( value ) ; }
		return value ;
	}

	if ( value === undefined ) { return '' ; }

	if ( column?.forceString ) {
		value = '' + value ;
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

