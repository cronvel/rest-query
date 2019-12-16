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



//const Promise = require( 'seventh' ) ;
//const ErrorStatus = require( 'error-status' ) ;



function HookContext( type , node , context , specific = {} ) {
	this.input = context.input ;
	this.output = context.output ;
	this.alter = context.alter ;

	this.batchOf = context.batchOf ;
	this.linker = context.linker ;

	this.collectionNode = null ;
	this.objectNode = null ;
	this.parentObjectNode = null ;

	this.incomingDocument = null ;
	this.document = null ;


	switch ( type ) {
		case HookContext.BEFORE_COLLECTION :
			this.incomingDocument = specific.incomingDocument ;
			this.collectionNode = node ;
			this.parentObjectNode = context.parentObjectNode ;
			break ;
		case HookContext.AFTER_COLLECTION :
			this.document = specific.document ;
			this.collectionNode = node ;
			this.parentObjectNode = context.parentObjectNode ;
			this.objectNode = specific.objectNode || null ;
			break ;
	}

	//if ( custom ) { Object.assign( this , custom ) ; }
}

module.exports = HookContext ;



HookContext.BEFORE_COLLECTION = 1 ;
HookContext.AFTER_COLLECTION = 2 ;
HookContext.BEFORE_OBJECT = 3 ;
HookContext.AFTER_OBJECT = 4 ;



// Prevent default and finish the client request NOW
HookContext.prototype.end = function() {
} ;

