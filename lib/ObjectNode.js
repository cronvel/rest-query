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



// Load modules
var tree = require( 'tree-kit' ) ; 
var ErrorStatus = require( 'error-status' ) ; 

var restQuery = require( './restQuery.js' ) ;





			/* Object Node */



function ObjectNode() { throw new Error( '[restQuery] Cannot create a ObjectNode object directly' ) ; }
module.exports = ObjectNode ;

ObjectNode.prototype = Object.create( restQuery.Node.prototype ) ;
ObjectNode.prototype.constructor = ObjectNode ;



ObjectNode.create = function createObjectNode( app , collectionNode , object , objectNode )
{
	var id ;
	
	if ( ! objectNode ) { objectNode = Object.create( restQuery.ObjectNode.prototype ) ; }
	
	if ( collectionNode )
	{
		restQuery.Node.create( app , objectNode , collectionNode.children ) ;
		
		if ( object )
		{
			if ( object.id ) { id = object.id ; }
			else if ( object.$ && object.$.id ) { id = object.$.id ; }
			else { id = null ; }
		}
		else
		{
			id = null ;
		}
	}
	else
	{
		restQuery.Node.create( app , objectNode ) ;
		id = '/' ;
		collectionNode = null ;
	}
	
	Object.defineProperties( objectNode , {
		collectionNode: { value: collectionNode , enumerable: true } ,
		object: { value: object , enumerable: true } ,
		id: { value: id , enumerable: true }
	} ) ;
	
	return objectNode ;
} ;


ObjectNode.prototype.get = function objectNodeGet( path , context , callback )
{
	var check ;
	
	
	// Check auth
	check = this.checkAuth( context ) ;
	if ( check instanceof Error ) { callback( check ) ; return ; }
	
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// Return that object!
		
		if ( ! this.collectionNode )
		{
			callback( undefined , this.object , {} ) ;
			return ;
		}
		
		callback( undefined , this.object.export() , {} ) ;
		return ;
	}
	
	var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.children[ parsedPathNode.identifier ].get(
				path.slice( 1 ) ,
				{ performer: context.performer , parentNode: this } ,
				callback
			) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



ObjectNode.prototype.post = function objectNodePost( path , rawDocument , context , callback )
{
	var check ;
	
	
	// Check auth
	check = this.checkAuth( context ) ;
	if ( check instanceof Error ) { callback( check ) ; return ; }
	
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a POST on an object node' } ) ) ;
		return ;
	}
	
	var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.children[ parsedPathNode.identifier ].post(
				path.slice( 1 ) ,
				rawDocument ,
				{ performer: context.performer , parentNode: this } ,
				callback
			) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



// If this method is called, it means that the object *EXISTS*,
// put on an unexistant object is performed at collection-level
ObjectNode.prototype.put = function objectNodePut( path , rawDocument , context , callback )
{
	var document , check ;
	
	
	// Check auth
	check = this.checkAuth( context ) ;
	if ( check instanceof Error ) { callback( check ) ; return ; }
	
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// If we are here, we are about to REPLACE an existing object
		
		//console.log( "@@@@@@@@@@@@@@@@@ this.object.id: " , this.object.id ) ;
		
		// It is not possible to overwrite the 'parent' property
		//console.log( '>>> Overwrite!' , string.inspect( { proto: true , style: 'color' } , this.object.$ ) ) ;
		//console.log( '>>> Overwrite!' , this.object.$.parent.blogs ) ;
		//console.log( '>>> Overwrite!' , this.object.$.parent ) ;
		
		if ( ! this.collectionNode )
		{
			callback( ErrorStatus.forbidden( { message: "Cannot PUT into a static node." } ) ) ;
			return ;
		}
		
		rawDocument.parent = tree.extend( null , {} , this.object.$.parent ) ;
		//rawDocument.parent = this.object.$.parent ;
		
		try {
			document = this.object.collection.createDocument( rawDocument , { id: this.object.id } ) ;
		}
		catch ( error ) {
			
			if ( error.validatorMessage )
			{
				callback( ErrorStatus.badRequest(
					{ message: "Document not validated: " + error.validatorMessage }
				) ) ;
			}
			else
			{
				callback( ErrorStatus.badRequest( { message: error } ) ) ;
			}
			return ;
		}
		
		document.save( { overwrite: true } , function( error ) {
			if ( error ) { callback( error ) ; return ; }
			callback( undefined , {} , {} ) ;
		} ) ;
		
		return ;
	}
	
	var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.children[ parsedPathNode.identifier ].put(
				path.slice( 1 ) ,
				rawDocument ,
				{ performer: context.performer , parentNode: this } ,
				callback
			) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



ObjectNode.prototype.patch = function objectNodePatch( path , rawDocument , context , callback )
{
	var check ;
	
	
	// Check auth
	check = this.checkAuth( context ) ;
	if ( check instanceof Error ) { callback( check ) ; return ; }
	
	
	path = restQuery.misc.pathToArray( path ) ;
	
	// /!\ 'auth' may forbid patch
	if ( path.length === 0 )
	{
		// /!\ 'auth' may forbid patch
		// /!\ That should be changed when 'auth' will be enforced
		
		if ( ! this.collectionNode )
		{
			callback( ErrorStatus.forbidden( { message: "Cannot PATCH a static node." } ) ) ;
			return ;
		}
		
		//console.log( '>>> ' , rawDocument ) ;
		tree.extend( { deep: true , unflat: true } , this.object.$ , rawDocument ) ;
		delete this.object.$.parent ;	// Do not modify the parent
		//console.log( 'patch: ' , string.inspect( { style: 'color' , proto: true } , this.object.$ ) ) ;
		
		// When useMemProxy is on (ODM), this fails without any reason
		
		this.object.save( function( error ) {
			if ( error ) { callback( error ) ; return ; }
			callback( undefined , {} , {} ) ;
		} ) ;
		
		return ;
	}
	
	var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.children[ parsedPathNode.identifier ].patch(
				path.slice( 1 ) ,
				rawDocument ,
				{ performer: context.performer , parentNode: this } ,
				callback
			) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



ObjectNode.prototype.delete = function objectNodeDelete( path , context , callback )
{
	var check ;
	
	
	// Check auth
	check = this.checkAuth( context ) ;
	if ( check instanceof Error ) { callback( check ) ; return ; }
	
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// If we are here, we are about to DELETE an existing object
		
		// /!\ 'auth' may forbid the delete
		// /!\ That should be changed when 'auth' will be enforced
		
		if ( ! this.collectionNode )
		{
			callback( ErrorStatus.forbidden( { message: "Cannot DELETE a static node." } ) ) ;
			return ;
		}
		
		this.object.delete( function( error ) {
			if ( error ) { callback( error ) ; return ; }
			callback( undefined , {} , {} ) ;
		} ) ;
		
		return ;
	}
	
	var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.children[ parsedPathNode.identifier ].delete(
				path.slice( 1 ) ,
				{ performer: context.performer , parentNode: this } ,
				callback
			) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



ObjectNode.prototype.checkAuth = function checkAuth( context )
{
	var parentCollectionName ;
	
	// First, check the ancestry chain: the current object should have
	// the previous object in the chain as its parent
	
	if ( context.parentNode && context.parentNode.id !== '/' )
	{
		/*
		console.log( "parent's id:" , context.parentNode.id ) ;
		//console.log( "parentNode :" , context.parentNode ) ;
		//console.log( "parent's collectionNode :" , context.parentNode.collectionNode ) ;
		//console.log( "parent collectionNode's collection:" , context.parentNode.collectionNode.collection ) ;
		console.log( "parent collection's name:" , context.parentNode.collectionNode.collection.name ) ;
		console.log( "object's parent:" , string.inspect( { style: 'color' , proto: true } , this.object.$.parent ) ) ;
		console.log( "object's parent ID:" , this.object.$.parent[ context.parentNode.collectionNode.collection.name ] ) ;
		*/
		
		parentCollectionName = context.parentNode.collectionNode.collection.name ;
		
		if ( 
			! this.object.$.parent ||
			! this.object.$.parent[ parentCollectionName ] ||
			context.parentNode.id.toString() !== this.object.$.parent[ parentCollectionName ].toString()
		)
		{
			return ErrorStatus.notFound( { message: "Ancestry mismatch." } ) ;
		}
	}
	
	return ;
} ;


