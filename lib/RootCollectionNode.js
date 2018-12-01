/*
	Rest Query

	Copyright (c) 2014 - 2018 Cédric Ronvel

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



const restQuery = require( './restQuery.js' ) ;

const ErrorStatus = require( 'error-status' ) ;
const doormen = require( 'doormen' ) ;
const hash = require( 'hash-kit' ) ;
const tree = require( 'tree-kit' ) ;



/*
	This describe the Root Collection Node.
	This is a CollectionNode, even if it contains only one object.
*/



function RootCollectionNode( app , schema ) {
	doormen( RootCollectionNode.schemaSchema , schema ) ;

	schema.properties.name = {
		in: [ '/' ] ,
		default: '/' ,
		type: 'string' ,
		tier: 1
	} ;

	// One unique name among siblings
	restQuery.CollectionNode.ensureIndex( schema.indexes , { properties: { name: 1 } , unique: true } ) ;

	// Call the parent constructor
	restQuery.CollectionNode.call( this , app , 'root' , schema ) ;
}

module.exports = RootCollectionNode ;

RootCollectionNode.prototype = Object.create( restQuery.CollectionNode.prototype ) ;
RootCollectionNode.prototype.constructor = restQuery.RootCollectionNode ;



// Used to detect root object
RootCollectionNode.prototype.isRoot = true ;



// WIP...

RootCollectionNode.schemaSchema = tree.extend(
	{ deep: true } ,
	{} ,
	restQuery.CollectionNode.schemaSchema ,
	{
		name: { in: ['root'] , default: 'root' }
	}
) ;



// Nothing special about Root, for instance
RootCollectionNode.prototype.initDocument = restQuery.CollectionNode.prototype.initDocument ;

