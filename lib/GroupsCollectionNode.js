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



const restQuery = require( './restQuery.js' ) ;
const CollectionNode = restQuery.CollectionNode ;

const ErrorStatus = require( 'error-status' ) ;
const doormen = require( 'doormen' ) ;
//const hash = require( 'hash-kit' ) ;
const tree = require( 'tree-kit' ) ;



/* GroupsCollectionNode */



function GroupsCollectionNode( app , schema ) {
	doormen( GroupsCollectionNode.schemaSchema , schema ) ;

	schema.properties.name = {
		type: 'string' ,
		tags: [ 'id' ] ,
		minLength: 1
	} ;

	schema.properties.users = {
		type: 'multiLink' ,
		collection: 'users' ,
		tags: [ 'member' ] ,
		default: []
	} ;

	// One unique name among siblings
	schema.indexes.push( { properties: { name: 1 , "parent.id": 1 } , unique: true } ) ;

	// Multikey index: permit finding a user id in the array, using $in
	schema.indexes.push( { links: { users: 1 } } ) ;

	// Call the parent constructor
	CollectionNode.call( this , app , 'groups' , schema ) ;
}

module.exports = GroupsCollectionNode ;

GroupsCollectionNode.prototype = Object.create( CollectionNode.prototype ) ;
GroupsCollectionNode.prototype.constructor = GroupsCollectionNode ;



// WIP...

GroupsCollectionNode.schemaSchema = tree.extend(
	{ deep: true } ,
	{} ,
	CollectionNode.schemaSchema ,
	{}
) ;



// Nothing special about Groups, for instance
//GroupsCollectionNode.prototype.initDocument = CollectionNode.prototype.initDocument ;

