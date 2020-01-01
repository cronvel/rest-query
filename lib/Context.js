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



const parsePath = require( 'rest-query-shared' ).path.parse ;
//const Promise = require( 'seventh' ) ;
//const ErrorStatus = require( 'error-status' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;



function Context( objectNode , performer , pathParts , input , output = {} ) {
	this.app = objectNode.app ;
	this.input = input ;
	this.output = output ;
	this.alter = {} ;

	// /!\ input.performer is DEPRECATED, but existing userland code may use it
	this.performer = performer || ( input && input.performer ) || this.app.createPerformer( null , true ) ;
	input.performer = this.performer ;

	// This may throw if pathParts is not correct
	if ( ! Array.isArray( pathParts ) ) { pathParts = parsePath( pathParts ) ; }

	this.pathParts = pathParts ;
	this.input.pathParts = this.input.pathParts || pathParts ;

	this.collectionNode = null ;
	this.objectNode = objectNode ;
	this.parentObjectNode = null ;
	this.ancestors = [] ;	// From the most recent to the most ancient

	this.batchOf = null ;
	this.linker = null ;
	this.linkerPath = null ;

	this.document = objectNode.object ;
	this.incomingDocument = null ;
	this.patch = null ;
	this.incomingPatch = null ;

	this.existingDocument = null ;
	this.deletedDocument = null ;
}

module.exports = Context ;



// For Logfella/String Kit inspect
Context.prototype.inspectPropertyBlackList = new Set( [ 'app' ] ) ;



Context.prototype.nextPart = function() {
	this.pathParts = this.pathParts.slice( 1 ) ;
	return this ;
} ;



Context.prototype.nextObjectNode = function( objectNode , nextPart , preserveLink ) {
	//log.hdebug( ".nextObjectNode() BF %Y" , this ) ;
	if ( this.objectNode ) {
		this.parentObjectNode = this.objectNode ;
		this.ancestors.unshift( this.objectNode ) ;
	}

	this.objectNode = objectNode ;
	this.collectionNode = objectNode.collectionNode ;

	if ( ! preserveLink ) {
		this.linker = this.linkerPath = this.batchOf = null ;
	}

	// Depends on the type of query
	this.document = objectNode.object ;

	if ( nextPart ) {
		this.pathParts = this.pathParts.slice( 1 ) ;
	}

	//log.hdebug( ".nextObjectNode() AF %Y" , this ) ;
	return this ;
} ;



Context.prototype.nextCollectionNode = function( collectionNode , nextPart ) {
	//log.hdebug( ".nextCollectionNode() BF %Y" , this ) ;
	this.collectionNode = collectionNode ;
	this.parentObjectNode = this.objectNode ;
	this.linker = this.linkerPath = this.batchOf = null ;

	if ( nextPart ) {
		this.pathParts = this.pathParts.slice( 1 ) ;
	}

	//log.hdebug( ".nextCollectionNode() AF %[l50000]Y" , this ) ;
	return this ;
} ;



Context.prototype.linkToObjectNode = function( objectNode , nextPart ) {
	this.ancestors[ 0 ] = this.parentObjectNode = this.app.root ;
	this.ancestors.length = 1 ;

	this.objectNode = objectNode ;
	this.collectionNode = objectNode.collectionNode ;

	this.linker = this.parentObjectNode ;
	this.linkerPath = this.pathParts[ 0 ].identifier ;

	// Depends on the type of query
	this.document = objectNode.object ;

	if ( nextPart ) {
		this.pathParts = this.pathParts.slice( 1 ) ;
	}

	return this ;
} ;



Context.prototype.multiLinkToCollectionNode = function( collectionNode , batchOf , nextPart ) {
	this.ancestors[ 0 ] = this.parentObjectNode = this.app.root ;
	this.ancestors.length = 1 ;

	this.collectionNode = collectionNode ;

	this.batchOf = batchOf ;
	this.linker = this.objectNode ;
	this.linkerPath = this.pathParts[ 0 ].identifier ;

	if ( nextPart ) {
		this.pathParts = this.pathParts.slice( 1 ) ;
	}

	return this ;
} ;



//function HookContext( type , context , collectionNode , objectNode = null , document = null , attachmentStreams = null ) {
function Context_( context , collectionNode , objectNode = null ) {
	this.collectionNode = collectionNode ;
	this.objectNode = objectNode ;
	this.parentObjectNode = context.parentObjectNode || null ;

	this.input = context.input ;
	this.output = context.output ;
	this.alter = context.alter ;

	this.batchOf = context.batchOf ;
	this.linker = context.linker ;

	this.incomingDocument = null ;
	this.document = null ;
	this.incomingPatch = null ;

	/*
	switch ( type ) {
		case Context.BEFORE_COLLECTION :
			this.incomingDocument = document ;
			this.parentObjectNode = context.parentObjectNode ;
			break ;
		case Context.AFTER_COLLECTION :
			this.document = document ;
			this.parentObjectNode = context.parentObjectNode ;
			break ;
		case Context.BEFORE_OBJECT :
			this.incomingDocument = document ;
			this.parentObjectNode = context.parentObjectNode ;
			break ;
		case Context.AFTER_OBJECT :
			this.document = document ;
			this.parentObjectNode = context.parentObjectNode ;
			break ;
	}
	*/
}



/*
Context.BEFORE_COLLECTION = 1 ;
Context.AFTER_COLLECTION = 2 ;
Context.BEFORE_OBJECT = 3 ;
Context.AFTER_OBJECT = 4 ;
*/


// Prevent default and finish the client request NOW
Context.prototype.end = function() {
} ;

