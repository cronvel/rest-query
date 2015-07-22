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
	var self = this ;
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// Get that object!
		
		// Check access
		this.checkAccess( context , restQuery.READ , function( error ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			if ( ! self.collectionNode )
			{
				callback( undefined , self.object , {} ) ;
				return ;
			}
			
			callback( undefined , self.object.export() , {} ) ;
			return ;
		} ) ;
		
		return ;
	}
	
	// Pass through that object!
	
	// Check access
	this.checkAccess( context , restQuery.PASS_THROUGH , function( error ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
		//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
		//# debug : console.log( "children:" , self.children ) ;
		
		if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
		
		switch ( parsedPathNode.type )
		{
			case 'member':
				if ( ! self.children[ parsedPathNode.identifier ] )
				{
					callback( ErrorStatus.notFound( { message: "Member '" + path[ 0 ] + "' not found." } ) ) ;
					return ;
				}
				
				self.children[ parsedPathNode.identifier ].get(
					path.slice( 1 ) ,
					{ performer: context.performer , parentNode: self } ,
					callback
				) ;
				
				break ;
			
			default:
				callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
				break ;
		}
	} ) ;
} ;



ObjectNode.prototype.post = function objectNodePost( path , rawDocument , context , callback )
{
	var self = this ;
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a POST on an object node' } ) ) ;
		return ;
	}
	
	// Pass through that object!
	
	// Check access
	this.checkAccess( context , restQuery.PASS_THROUGH , function( error ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
		//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
		//# debug : console.log( "children:" , self.children ) ;
		
		if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
		
		switch ( parsedPathNode.type )
		{
			case 'member':
				if ( ! self.children[ parsedPathNode.identifier ] )
				{
					callback( ErrorStatus.notFound( { message: "Member '" + path[ 0 ] + "' not found." } ) ) ;
					return ;
				}
				
				self.children[ parsedPathNode.identifier ].post(
					path.slice( 1 ) ,
					rawDocument ,
					{ performer: context.performer , parentNode: self } ,
					callback
				) ;
				
				break ;
			
			default:
				callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
				break ;
		}
	} ) ;
} ;



// If this method is called, it means that the object *EXISTS*,
// put on an unexistant object is performed at collection-level
ObjectNode.prototype.put = function objectNodePut( path , rawDocument , context , callback )
{
	var self = this , document ;
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// If we are here, we are about to REPLACE an existing object
		
		if ( ! this.collectionNode )
		{
			callback( ErrorStatus.forbidden( { message: "Cannot PUT into a static node." } ) ) ;
			return ;
		}
		
		// Check access
		this.checkAccess( context , restQuery.READ_CREATE_MODIFY , function( error ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			//rawDocument.parent = tree.extend( null , {} , self.object.$.parent ) ;
			if ( self.object.$.parent )
			{
				rawDocument.parent = {
					collection: self.object.$.parent.collection ,
					id: self.object.$.parent.id ,
				} ;
			}
			else
			{
				// Just to be sure...
				delete rawDocument.parent ;
			}
			
			try {
				document = self.object.collection.createDocument( rawDocument , { id: self.object.id } ) ;
			}
			catch ( error ) {
				
				if ( error.validatorMessage )
				{
					callback( ErrorStatus.badRequest(
						{
							message: "Document not validated: " + error.validatorMessage ,
							stack: error.stack
						}
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
		} ) ;
		
		return ;
	}
	
	// Pass through that object!
	
	// Check access
	this.checkAccess( context , restQuery.PASS_THROUGH , function( error ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
		//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
		//# debug : console.log( "children:" , self.children ) ;
		
		if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
		
		switch ( parsedPathNode.type )
		{
			case 'member':
				if ( ! self.children[ parsedPathNode.identifier ] )
				{
					callback( ErrorStatus.notFound( { message: "Member '" + path[ 0 ] + "' not found." } ) ) ;
					return ;
				}
				
				self.children[ parsedPathNode.identifier ].put(
					path.slice( 1 ) ,
					rawDocument ,
					{ performer: context.performer , parentNode: self } ,
					callback
				) ;
				
				break ;
			
			default:
				callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
				break ;
		}
	} ) ;
} ;



ObjectNode.prototype.patch = function objectNodePatch( path , rawDocument , context , callback )
{
	var self = this ;
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// Patch that object!
		
		if ( ! this.collectionNode )
		{
			callback( ErrorStatus.forbidden( { message: "Cannot PATCH a static node." } ) ) ;
			return ;
		}
		
		// Check access
		this.checkAccess( context , restQuery.READ_CREATE_MODIFY , function( error ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			//console.log( '>>> ' , rawDocument ) ;
			tree.extend( { deep: true , unflat: true } , self.object.$ , rawDocument ) ;
			delete self.object.$.parent ;	// Do not modify the parent in a PATCH request
			//console.log( 'patch: ' , string.inspect( { style: 'color' , proto: true } , self.object.$ ) ) ;
			
			// When useMemProxy is on (ODM), this fails without any reason
			
			self.object.save( function( error ) {
				if ( error ) { callback( error ) ; return ; }
				callback( undefined , {} , {} ) ;
			} ) ;
		} ) ;
		
		return ;
	}
	
	// Pass through that object!
	
	// Check access
	this.checkAccess( context , restQuery.PASS_THROUGH , function( error ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
		//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
		//# debug : console.log( "children:" , self.children ) ;
		
		if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
		
		switch ( parsedPathNode.type )
		{
			case 'member':
				if ( ! self.children[ parsedPathNode.identifier ] )
				{
					callback( ErrorStatus.notFound( { message: "Member '" + path[ 0 ] + "' not found." } ) ) ;
					return ;
				}
				
				self.children[ parsedPathNode.identifier ].patch(
					path.slice( 1 ) ,
					rawDocument ,
					{ performer: context.performer , parentNode: self } ,
					callback
				) ;
				
				break ;
			
			default:
				callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
				break ;
		}
	} ) ;
} ;



ObjectNode.prototype.delete = function objectNodeDelete( path , context , callback )
{
	var self = this ;
	
	path = restQuery.misc.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// If we are here, we are about to DELETE an existing object
		
		if ( ! this.collectionNode )
		{
			callback( ErrorStatus.forbidden( { message: "Cannot DELETE a static node." } ) ) ;
			return ;
		}
		
		// Check access
		this.checkAccess( context , restQuery.ALL , function( error ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			self.object.delete( function( error ) {
				if ( error ) { callback( error ) ; return ; }
				callback( undefined , {} , {} ) ;
			} ) ;
		} ) ;
		
		return ;
	}
	
	// Pass through that object!
	
	// Check access
	this.checkAccess( context , restQuery.PASS_THROUGH , function( error ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		var parsedPathNode = restQuery.Node.parsePathNode( path[ 0 ] ) ;
		//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
		//# debug : console.log( "children:" , self.children ) ;
		
		if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
		
		switch ( parsedPathNode.type )
		{
			case 'member':
				if ( ! self.children[ parsedPathNode.identifier ] )
				{
					callback( ErrorStatus.notFound( { message: "Member '" + path[ 0 ] + "' not found." } ) ) ;
					return ;
				}
				
				self.children[ parsedPathNode.identifier ].delete(
					path.slice( 1 ) ,
					{ performer: context.performer , parentNode: self } ,
					callback
				) ;
				
				break ;
			
			default:
				callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
				break ;
		}
	} ) ;
} ;



ObjectNode.prototype.checkAccess = function checkAccess( context , accessNeeded , callback )
{
	var self = this , parentCollectionName ;
	
	// First, check the ancestry chain: the current object should have
	// the previous object in the chain as its parent
	
	if ( context.parentNode && context.parentNode.id !== '/' )
	{
		parentCollectionName = context.parentNode.collectionNode.collection.name ;
		
		if ( 
			! this.object.$.parent ||
			this.object.$.parent.collection !== parentCollectionName ||
			context.parentNode.id.toString() !== this.object.$.parent.id.toString()
		)
		{
			callback( ErrorStatus.notFound( { message: "Ancestry mismatch." } ) ) ;
			return ;
		}
	}
	
	// For instance, everyone has access to /
	if ( this.id === '/' ) { callback() ; return ; }
	
	//console.log( "other access:" ,  this.object.$.otherAccess , accessNeeded ) ;
	if ( this.object.$.otherAccess >= accessNeeded ) { callback() ; return ; }
	
	context.performer.getUser( function( error , user ) {
		
		var userId ;
		
		if ( error ) { callback( error ) ; return ; }
		
		if ( ! user ) { callback( ErrorStatus.unauthorized( { message: "Public access forbidden." } ) ) ; return ; }
		
		userId = user._id.toString() ;
		
		if ( userId in self.object.$.userAccess && self.object.$.userAccess[ userId ] >= accessNeeded ) { callback() ; return ; }
		
		// Later, we should check group authorization here ------------------------------------
		
		callback( ErrorStatus.forbidden( { message: "Access forbidden." } ) ) ;
	} ) ;
} ;



