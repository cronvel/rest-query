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

"use strict" ;



// Load modules
var tree = require( 'tree-kit' ) ; 
var async = require( 'async-kit' ) ; 
var ErrorStatus = require( 'error-status' ) ; 
var rootsDb = require( 'roots-db' ) ;
var doormen = require( 'doormen' ) ;

var restQuery = require( './restQuery.js' ) ;





			/* Object Node */



function ObjectNode() { throw new Error( '[restQuery] Cannot create a ObjectNode object directly' ) ; }
module.exports = ObjectNode ;

ObjectNode.prototype = Object.create( restQuery.Node.prototype ) ;
ObjectNode.prototype.constructor = ObjectNode ;



ObjectNode.create = function createObjectNode( app , collectionNode , object , ancestors , objectNode )
{
	var id , autoCollection , methods ;
	
	if ( ! objectNode ) { objectNode = Object.create( restQuery.ObjectNode.prototype ) ; }
	
	if ( collectionNode )
	{
		restQuery.Node.create( app , objectNode , collectionNode.children ) ;
		autoCollection = collectionNode.autoCollection ;
		methods = collectionNode.objectMethods ;
		
		if ( object )
		{
			if ( object.$ && object.$.id ) { id = object.$.id ; }
			//else if ( object.$id ) { id = object.$id ; }
			else { id = null ; }
		}
		else
		{
			id = null ;
		}
	}
	else
	{
		// If no collection, we are creating the root node
		restQuery.Node.create( app , objectNode ) ;
		id = '/' ;
		collectionNode = null ;
		autoCollection = app.rootAutoCollection ;
		methods = app.rootMethods ;
	}
	
	Object.defineProperties( objectNode , {
		collectionNode: { value: collectionNode , enumerable: true } ,
		autoCollection: { value: autoCollection , enumerable: true } ,
		object: { value: object , enumerable: true } ,
		id: { value: id , enumerable: true } ,
		methods: { value: methods , enumerable: true } ,
		ancestors: { value: ancestors || [] , enumerable: true }
	} ) ;
	
	return objectNode ;
} ;



ObjectNode.prototype._get = function _objectNodeGet( pathParts , context , callback )
{
	var self = this , nextPath , nextCollection , exported , linkDetails ;
	
	if ( pathParts.length === 0 || ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) )
	{
		// Get that object!
		
		// Check access
		restQuery.Node.checkAccess( context.input.performer , 'read' , 1 , self.object , self.ancestors , function( error ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			
			//exported = doormen.mask( self.collectionNode.collection.documentSchema , self.object , { tier: 3 , schemaDefaultTier: 3 } ) ;
			//console.log( "exported:" , exported ) ;
			
			var afterContext = {
				input: context.input ,
				output: context.output ,
				document: self.object ,
				collectionNode: self.collectionNode ,
				objectNode: self 
			} ;
			
			if ( pathParts.length )
			{
				callback( undefined , tree.path.get( self.object , pathParts[ 0 ].identifier ) , afterContext ) ;
				//callback( undefined , tree.path.get( exported , pathParts[ 0 ].identifier ) , {} ) ;
			}
			else
			{
				callback( undefined , self.object , afterContext ) ;
				//callback( undefined , exported , {} ) ;
			}
		} ) ;
		
		return ;
	}
	
	
	// Pass through that object!
	
	// Check access
	restQuery.Node.checkAccess( context.input.performer , 'traverse' , 1 , self.object , self.ancestors , function( error ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		
		switch ( pathParts[ 0 ].type )
		{
			case 'collection':
				if ( ! self.children[ pathParts[ 0 ].identifier ] )
				{
					callback( ErrorStatus.notFound( { message: "Collection '" + pathParts[ 0 ].identifier + "' not found." } ) ) ;
					return ;
				}
				
				nextPath = pathParts.slice( 1 ) ;
				nextCollection = pathParts[ 0 ].identifier ;
				
				break ;
			
			case 'id':
			case 'slugId':
				if ( ! self.autoCollection || ! self.children[ self.autoCollection ] )
				{
					callback( ErrorStatus.notFound( { message: "No auto collection on this item." } ) ) ;
					return ;
				}
				
				nextPath = pathParts ;
				nextCollection = self.autoCollection ;
				
				break ;
			
			case 'linkProperty':
				
				if ( ! self.object.$ )
				{
					callback( ErrorStatus.badRequest( { message: 'No link property on a static node.' } ) ) ;
					return ;
				}
				
				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				self.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , function( error , document ) {
					
					if ( error ) { callback( error ) ; return ; }
					
					if ( document instanceof rootsDb.Attachment )
					{
						// It's an attachment, send back the readable stream, with its meta-data
						document.getReadStream( function( error , readStream ) {
							if ( error ) { callback( error ) ; return ; }
							
							context.output.meta = document ;
							
							var afterContext =  {
								input: context.input ,
								output: context.output ,
								document: self.object ,
								collectionNode: self.collectionNode ,
								objectNode: self 
							} ;
							
							callback( undefined , readStream , afterContext ) ;
						} ) ;
						
						return ;
					}
					
					var collection = self.app.collectionNodes[ document.$.collection.name ] ;
					// we instanciate an objectNode to query
					var objectNode = collection.createObjectNode( document , [ self.app.root ] ) ;
					
					objectNode._get(
						pathParts.slice( 1 ) ,
						{
							intput: context.input ,
							output: context.output ,
							//performer: context.input.performer ,
							//query: context.input.query ,
						} ,
						callback
					) ;
				} ) ;
				
				return ;
			
			case 'multiLinkProperty':
				
				if ( ! self.object.$ )
				{
					callback( ErrorStatus.badRequest( { message: 'No multi-link property on a static node.' } ) ) ;
					return ;
				}
				
				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				linkDetails = self.object.$.getLinkDetails( pathParts[ 0 ].identifier ) ;
					
				if ( ! linkDetails )
				{
					callback( ErrorStatus.badRequest( { message: 'Multi-link not found.' } ) ) ;
					return ;
				}
				
				self.app.collectionNodes[ linkDetails.foreignCollection ]._get(
					pathParts.slice( 1 ) ,
					{
						intput: context.input ,
						output: context.output ,
						//performer: context.input.performer ,
						//query: context.input.query ,
						batchOf: linkDetails.foreignIds ,
						linker: self ,
						linkerPath: pathParts[ 0 ].identifier ,
						parentObjectNode: self.app.root
					} ,
					callback
				) ;
				
				return ;
			
			default:
				callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
				return ;
		}
		
		
		// Process the child collection
		self.children[ nextCollection ]._get(
			nextPath ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				parentObjectNode: self
			} ,
			callback
		) ;
	} ) ;
} ;



ObjectNode.prototype._post = function _objectNodePost( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , nextPath , nextCollection , linkDetails ;
	
	if ( pathParts.length === 0 || ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a POST on an object node or property node' } ) ) ;
		return ;
	}
	
	// Pass through that object!
	
	// Check access
	restQuery.Node.checkAccess( context.input.performer , 'traverse' , 1 , self.object , self.ancestors , function( error ) {
			
		if ( error ) { callback( error ) ; return ; }
		
		
		switch ( pathParts[ 0 ].type )
		{
			case 'collection':
				if ( ! self.children[ pathParts[ 0 ].identifier ] )
				{
					callback( ErrorStatus.notFound( { message: "Collection '" + pathParts[ 0 ].identifier + "' not found." } ) ) ;
					return ;
				}
				
				nextPath = pathParts.slice( 1 ) ;
				nextCollection = pathParts[ 0 ].identifier ;
				
				break ;
			
			case 'id':
			case 'slugId':
				if ( ! self.autoCollection || ! self.children[ self.autoCollection ] )
				{
					callback( ErrorStatus.notFound( { message: "No auto collection on this item." } ) ) ;
					return ;
				}
				
				nextPath = pathParts ;
				nextCollection = self.autoCollection ;
				
				break ;
			
			case 'linkProperty':
				
				if ( ! self.object.$ )
				{
					callback( ErrorStatus.badRequest( { message: 'No link property on a static node.' } ) ) ;
					return ;
				}
				
				// We cannot really use the CollectionNode#post(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				self.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , function( error , document ) {
					
					if ( error ) { callback( error ) ; return ; }
					
					if ( document instanceof rootsDb.Attachment )
					{
						// It's an attachment, send back the readable stream, with its meta-data
						callback( ErrorStatus.badRequest( { message: 'Cannot perform a POST on/through an Attachment.' } ) ) ;
						return ;
					}
					
					var collection = self.app.collectionNodes[ document.$.collection.name ] ;
					// we instanciate an objectNode to query
					var objectNode = collection.createObjectNode( document , [ self.app.root ] ) ;
					
					objectNode._post(
						pathParts.slice( 1 ) ,
						incomingDocument ,
						attachmentStreams ,
						{
							intput: context.input ,
							output: context.output ,
							//performer: context.input.performer ,
							//query: context.input.query ,
						} ,
						callback
					) ;
				} ) ;
				
				return ;
				
			case 'multiLinkProperty':
				
				if ( ! self.object.$ )
				{
					callback( ErrorStatus.badRequest( { message: 'No multi-link property on a static node.' } ) ) ;
					return ;
				}
				
				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				linkDetails = self.object.$.getLinkDetails( pathParts[ 0 ].identifier ) ;
					
				if ( ! linkDetails )
				{
					callback( ErrorStatus.badRequest( { message: 'Multi-link not found.' } ) ) ;
					return ;
				}
				
				self.app.collectionNodes[ linkDetails.foreignCollection ]._post(
					pathParts.slice( 1 ) ,
					incomingDocument ,
					attachmentStreams ,
					{
						intput: context.input ,
						output: context.output ,
						//performer: context.input.performer ,
						//query: context.input.query ,
						batchOf: linkDetails.foreignIds ,
						linker: self ,
						linkerPath: pathParts[ 0 ].identifier ,
						parentObjectNode: self.app.root
					} ,
					callback
				) ;
				
				return ;
			
			case 'method' :
				if ( ! self.methods[ pathParts[ 0 ].identifier ] )
				{
					callback( ErrorStatus.notFound( { message: "Method '" + pathParts[ 0 ] + "' not found." } ) ) ;
					return ;
				}
				
				self.methods[ pathParts[ 0 ].identifier ].call( self , pathParts , incomingDocument , attachmentStreams , context , callback ) ;
				return ;
			
			default:
				callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
				return ;
		}
		
		
		// Process the child collection
		self.children[ nextCollection ]._post(
			nextPath ,
			incomingDocument ,
			attachmentStreams ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				parentObjectNode: self
			} ,
			callback
		) ;
	} ) ;
} ;



// If this method is called, it means that the object *EXISTS*,
// PUT on an unexistant object is performed at collection-level.
ObjectNode.prototype._put = function _objectNodePut( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , nextPath , nextCollection , documentPatch , linkDetails ;
	
	if ( pathParts.length === 0 )
	{
		// If we are here, we are about to REPLACE an existing object
		
		if ( ! this.collectionNode )
		{
			callback( ErrorStatus.forbidden( { message: "Cannot PUT into a static node." } ) ) ;
			return ;
		}
		
		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) )
		{
			callback( ErrorStatus.badRequest( { message: "The body of a PUT request, replacing a whole document, should be a strict Object." } ) ) ;
			return ;
		}
		
		// Check access
		/*
			/!\ access 4 or 5?
			Or should a special access type 'replace' be created?
			Or double-check for 'delete' on this node and 'create' on the parent node?
			Well, 'write 4' looks ok: one should have a 'restricted' access to the ressource.
		*/
		restQuery.Node.checkAccess( context.input.performer , 'write' , 4 , self.object , self.ancestors ,
			function( error ) {
				if ( error ) { callback( error ) ; return ; }
				self.putOverwriteDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			}
		) ;
		
		return ;
	}
	
	// The next and final node is a property node, transform that into a PATCH request
	if ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' )
	{
		documentPatch = {} ;
		documentPatch[ pathParts[ 0 ].identifier ] = incomingDocument ;
		this._patch( [] , documentPatch , attachmentStreams , context , callback ) ;
		return ;
	}
	
	
	// Pass through that object!
	
	// Check access
	restQuery.Node.checkAccess( context.input.performer , 'traverse' , 1 , self.object , self.ancestors , function( error ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		
		switch ( pathParts[ 0 ].type )
		{
			case 'collection':
				if ( ! self.children[ pathParts[ 0 ].identifier ] )
				{
					callback( ErrorStatus.notFound( { message: "Collection '" + pathParts[ 0 ].identifier + "' not found." } ) ) ;
					return ;
				}
				
				nextPath = pathParts.slice( 1 ) ;
				nextCollection = pathParts[ 0 ].identifier ;
				
				break ;
			
			case 'id':
			case 'slugId':
				if ( ! self.autoCollection || ! self.children[ self.autoCollection ] )
				{
					callback( ErrorStatus.notFound( { message: "No auto collection on this item." } ) ) ;
					return ;
				}
				
				nextPath = pathParts ;
				nextCollection = self.autoCollection ;
				
				break ;
			
			case 'linkProperty':
				
				if ( ! self.object.$ )
				{
					callback( ErrorStatus.badRequest( { message: 'No link property on a static node.' } ) ) ;
					return ;
				}
				
				// If there is only one part left, then it's a putLink request
				if ( pathParts.length === 1 )
				{
					self.putLink( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
					return ;
				}
				
				// ... else, we just pass through
				
				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				self.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , function( error , document ) {
					
					if ( error ) { callback( error ) ; return ; }
					
					if ( document instanceof rootsDb.Attachment )
					{
						// It's an attachment, send back the readable stream, with its meta-data
						document.getReadStream( function( error , readStream ) {
							
							callback( ErrorStatus.internalError( { message: "PUT on attachment is not coded ATM" } ) ) ;
							return ;
							
// /!\ -------------------- // /!\ WTF? regression? this was the code for the GET on an attachment... /!\
							
							if ( error ) { callback( error ) ; return ; }
							callback( undefined , readStream , document ) ;
						} ) ;
						
						return ;
					}
					
					var collection = self.app.collectionNodes[ document.$.collection.name ] ;
					// we instanciate an objectNode to query
					var objectNode = collection.createObjectNode( document , [ self.app.root ] ) ;
					
					objectNode._put(
						incomingDocument ,
						attachmentStreams ,
						pathParts.slice( 1 ) ,
						{
							intput: context.input ,
							output: context.output ,
							//performer: context.input.performer ,
							//query: context.input.query ,
						} ,
						callback
					) ;
				} ) ;
				
				return ;
			
			case 'multiLinkProperty':
				
				if ( ! self.object.$ )
				{
					callback( ErrorStatus.badRequest( { message: 'No multi-link property on a static node.' } ) ) ;
					return ;
				}
				
				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				linkDetails = self.object.$.getLinkDetails( pathParts[ 0 ].identifier ) ;
					
				if ( ! linkDetails )
				{
					callback( ErrorStatus.badRequest( { message: 'Multi-link not found.' } ) ) ;
					return ;
				}
				
				self.app.collectionNodes[ linkDetails.foreignCollection ]._put(
					pathParts.slice( 1 ) ,
					incomingDocument ,
					attachmentStreams ,
					{
						intput: context.input ,
						output: context.output ,
						//performer: context.input.performer ,
						//query: context.input.query ,
						batchOf: linkDetails.foreignIds ,
						linker: self ,
						linkerPath: pathParts[ 0 ].identifier ,
						parentObjectNode: self.app.root
					} ,
					callback
				) ;
				
				return ;
			
			default:
				callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
				return ;
		}
		
		
		// Process the child collection
		self.children[ nextCollection ]._put(
			nextPath ,
			incomingDocument ,
			attachmentStreams ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				parentObjectNode: self
			} ,
			callback
		) ;
	} ) ;
} ;



ObjectNode.prototype.putOverwriteDocument = function putOverwriteDocument( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , hookContext ;
	
	if ( ! context.beforeCreateDone )
	{
		incomingDocument.parent = {
			collection: self.ancestors[ 0 ].collectionNode && self.ancestors[ 0 ].collectionNode.name ,
			id: self.ancestors[ 0 ].id
		} ;
		
		// Keep $id
		incomingDocument.$id = self.id ;
		
		// If no slug is provided, keep the current slug
		if ( ! incomingDocument.slugId ) { incomingDocument.slugId = self.object.slugId ; }
		
		if ( this.collectionNode.beforeCreateHook )
		{
			hookContext = {
				input: context.input ,
				output: context.output ,
				//method: 'put' ,
				existing: self.object ,
				incomingDocument: incomingDocument ,
				//pathParts: pathParts ,
				//attachmentStreams: attachmentStreams ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				//app: self.app ,
				collectionNode: self.collectionNode ,
				objectNode: self
			} ;
			
			this.collectionNode.beforeCreateHook( hookContext , function( error ) {
				if ( error ) { callback( error ) ; return ; }
				context.beforeCreateDone = true ;
				self.putOverwriteDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			} ) ;
			
			return ;
		}
	}
	
	try {
		this.collectionNode.initDocument( incomingDocument ) ;
		self.collectionNode.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		callback( self.transformError( error ) ) ;
		return ;
	}
	
	incomingDocument.$.save( {
		overwrite: true ,
		clearAttachments: true ,	// We are replacing an object, so we need to clear attachments first
		attachmentStreams: attachmentStreams
		} , function( error ) {
			if ( error ) { callback( self.transformError( error ) ) ; return ; }
			//callback( undefined , {} , { status: 200 } ) ;
			
			if ( ! self.collectionNode.afterCreateHook )
			{
				callback( undefined , {} , { status: 200 } ) ;
				return ;
			}
			
			hookContext = {
				input: context.input ,
				output: context.output ,
				//method: 'put' ,
				existing: self.object ,
				document: incomingDocument ,
				//pathParts: pathParts ,
				//attachmentStreams: attachmentStreams ,	// useless: already consumed
				//performer: context.input.performer ,
				//query: context.input.query ,
				//app: self.app ,
				collectionNode: self.collectionNode ,
				
				// 'self' is now obsolete as the object node
				objectNode: self.collectionNode.createObjectNode( incomingDocument , [ self ].concat( self.ancestors ) )
			} ;
			
			self.collectionNode.afterCreateHook( hookContext , function( error ) {
				// Send 200 anyway?
				if ( error ) { callback( error , {} , { status: 200 } ) ; return ; }
				callback( undefined , {} , { status: 200 } ) ;
			} ) ;
		}
	) ;
} ;



ObjectNode.prototype.putLink = function putLink( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this ;
	
	// We cannot really use the CollectionNode#put(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.
	self.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , function( error , document ) {
		
		var collection , objectNode , details ;
		
		if ( error )
		{
			if ( error.type === 'notFound' && pathParts.length === 1 )
			{
				// This is a normal case: the target does not exist yet,
				// and should be created by the request
				
				details = self.object.$.getLinkDetails( pathParts[ 0 ].identifier ) ;
				
				if ( details.type === 'attachment' )
				{
					self.object.$.commit( { attachmentStreams: attachmentStreams } , function( error ) {
						if ( error ) { callback( self.transformError( error ) ) ; return ; }
						callback( undefined , {} , {} ) ;
					} ) ;
					
					return ;
				}
				else if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) )
				{
					callback( ErrorStatus.badRequest( { message: "The body of a PUT request, creating a new document, should be a strict Object." } ) ) ;
					return ;
				}
				
				
				//collection = self.app.collectionNodes[ details.foreignCollection ].collection ;
				
				async.parallel( [
					function( asyncCallback ) {
						// /!\ not really 'write 1' but should use the tier level of this link
						restQuery.Node.checkAccess( context.input.performer , 'write' , 1 , self.object , self.ancestors , asyncCallback ) ;
					} ,
					function( asyncCallback ) {
						restQuery.Node.checkAccess( context.input.performer , 'create' , 1 , self.app.root.object , self.app.root.ancestors , asyncCallback ) ;
					}
				] )
				.exec( function( error ) {
					if ( error ) { callback( error ) ; return ; }
					context.targetCollectionNode = self.app.collectionNodes[ details.foreignCollection ] ;
					self.putNewLinkedDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
				} ) ;
				
				return ;
			}
			else
			{
				callback( error ) ;
				return ;
			}
		}
		
		if ( document instanceof rootsDb.Attachment )
		{
			self.object.$.commit( { attachmentStreams: attachmentStreams } , function( error ) {
				if ( error ) { callback( self.transformError( error ) ) ; return ; }
				callback( undefined , {} , {} ) ;
			} ) ;
			
			return ;
		}
		
		collection = self.app.collectionNodes[ document.$.collection.name ] ;
		
		// we instanciate an objectNode to query
		objectNode = collection.createObjectNode( document , [ self.app.root ] ) ;
		
		objectNode._put(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
			} ,
			callback
		) ;
	} ) ;
} ;



ObjectNode.prototype.putNewLinkedDocument = function putNewLinkedDocument( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , hookContext , id ;
	
	if ( ! context.beforeCreateDone )
	{
		incomingDocument.parent = {
			collection: null ,
			id: '/'
		} ;
		
		incomingDocument.$id = context.targetCollectionNode.collection.createId( incomingDocument ) ;
		
		if ( context.targetCollectionNode.beforeCreateHook )
		{
			hookContext = {
				input: context.input ,
				output: context.output ,
				//method: 'put' ,
				linkedFrom: self.object ,
				incomingDocument: incomingDocument ,
				//pathParts: pathParts ,
				//attachmentStreams: attachmentStreams ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				//app: self.app ,
				collectionNode: self.collectionNode ,
				objectNode: self
			} ;
			
			context.targetCollectionNode.beforeCreateHook( hookContext , function( error ) {
				if ( error ) { callback( error ) ; return ; }
				context.beforeCreateDone = true ;
				self.putNewLinkedDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			} ) ;
			
			return ;
		}
	}
	
	
	try {
		this.collectionNode.initDocument( incomingDocument ) ;
		id = incomingDocument.$id ;
		context.targetCollectionNode.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		callback( self.transformError( error ) ) ;
		return ;
	}
	
	incomingDocument.$.save( function( error ) {
		if ( error ) { callback( self.transformError( error ) ) ; return ; }
		
		self.object.$.setLink( pathParts[ 0 ].identifier , incomingDocument ) ;
		
		self.object.$.commit( function( error ) {
			if ( error ) { callback( self.transformError( error ) ) ; return ; }
			//callback( undefined , { id: id } , { status: 201 } ) ;
			
			if ( ! self.collectionNode.afterCreateHook )
			{
				callback( undefined , { id: id } , { status: 201 } ) ;
				return ;
			}
			
			hookContext = {
				input: context.input ,
				output: context.output ,
				//method: 'put' ,
				linkedFrom: self.object ,
				document: incomingDocument ,
				//pathParts: pathParts ,
				//attachmentStreams: attachmentStreams ,	// useless: already consumed
				//performer: context.input.performer ,
				//query: context.input.query ,
				//app: self.app ,
				collectionNode: self.collectionNode ,
				objectNode: self.collectionNode.createObjectNode( incomingDocument , [ self.app.root ] )
			} ;
			
			self.collectionNode.afterCreateHook( hookContext , function( error ) {
				// Send 201 anyway?
				if ( error ) { callback( error , { id: id } , { status: 201 } ) ; return ; }
				callback( undefined , { id: id } , { status: 201 } ) ;
			} ) ;
		} ) ;
	} ) ;
} ;



ObjectNode.prototype._patch = function _objectNodePatch( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , nextPath , nextCollection , linkDetails ;
	
	if ( pathParts.length === 0 || ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) )
	{
		// Patch that object!
		
		if ( ! this.collectionNode )
		{
			callback( ErrorStatus.forbidden( { message: "Cannot PATCH a static node." } ) ) ;
			return ;
		}
		
		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) )
		{
			callback( ErrorStatus.badRequest( { message: "The body of a PATCH request should be a strict Object." } ) ) ;
			return ;
		}
		
		// Check access
		restQuery.Node.checkAccess( context.input.performer , 'write' , 1 , self.object , self.ancestors , function( error ) {
			if ( error ) { callback( error ) ; return ; }
			self.patchDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
		} ) ;
		
		return ;
	}
	
	// Pass through that object!
	
	// Check access
	restQuery.Node.checkAccess( context.input.performer , 'traverse' , 1 , self.object , self.ancestors , function( error ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		
		switch ( pathParts[ 0 ].type )
		{
			case 'collection':
				if ( ! self.children[ pathParts[ 0 ].identifier ] )
				{
					callback( ErrorStatus.notFound( { message: "Collection '" + pathParts[ 0 ].identifier + "' not found." } ) ) ;
					return ;
				}
				
				nextPath = pathParts.slice( 1 ) ;
				nextCollection = pathParts[ 0 ].identifier ;
				
				break ;
			
			case 'id':
			case 'slugId':
				if ( ! self.autoCollection || ! self.children[ self.autoCollection ] )
				{
					callback( ErrorStatus.notFound( { message: "No auto collection on this item." } ) ) ;
					return ;
				}
				
				nextPath = pathParts ;
				nextCollection = self.autoCollection ;
				
				break ;
			
			case 'linkProperty':
				
				if ( ! self.object.$ )
				{
					callback( ErrorStatus.badRequest( { message: 'No link property on a static node.' } ) ) ;
					return ;
				}
				
				// If there is only one part left, then it's a putLink request
				if ( pathParts.length === 1 )
				{
					self.patchLink( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
					return ;
				}
				
				// ... else, we just pass through
				
				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				self.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , function( error , document ) {
					
					if ( error ) { callback( error ) ; return ; }
					
					if ( document instanceof rootsDb.Attachment )
					{
						// It's an attachment, send back the readable stream, with its meta-data
						document.getReadStream( function( error , readStream ) {
							if ( error ) { callback( error ) ; return ; }
							callback( undefined , readStream , document ) ;
						} ) ;
						
						return ;
					}
					
					var collection = self.app.collectionNodes[ document.$.collection.name ] ;
					// we instanciate an objectNode to query
					var objectNode = collection.createObjectNode( document , [ self.app.root ] ) ;
					
					objectNode._patch(
						pathParts.slice( 1 ) ,
						incomingDocument ,
						attachmentStreams ,
						{
							intput: context.input ,
							output: context.output ,
							//performer: context.input.performer ,
							//query: context.input.query ,
						} ,
						callback
					) ;
				} ) ;
				
				return ;
			
			case 'multiLinkProperty':
				
				if ( ! self.object.$ )
				{
					callback( ErrorStatus.badRequest( { message: 'No multi-link property on a static node.' } ) ) ;
					return ;
				}
				
				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				linkDetails = self.object.$.getLinkDetails( pathParts[ 0 ].identifier ) ;
					
				if ( ! linkDetails )
				{
					callback( ErrorStatus.badRequest( { message: 'Multi-link not found.' } ) ) ;
					return ;
				}
				
				self.app.collectionNodes[ linkDetails.foreignCollection ]._patch(
					pathParts.slice( 1 ) ,
					incomingDocument ,
					attachmentStreams ,
					{
						intput: context.input ,
						output: context.output ,
						//performer: context.input.performer ,
						//query: context.input.query ,
						batchOf: linkDetails.foreignIds ,
						linker: self ,
						linkerPath: pathParts[ 0 ].identifier ,
						parentObjectNode: self.app.root
					} ,
					callback
				) ;
				
				return ;
			
			default:
				callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
				return ;
		}
		
		
		// Process the child collection
		self.children[ nextCollection ]._patch(
			nextPath ,
			incomingDocument ,
			attachmentStreams ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				parentObjectNode: self
			} ,
			callback
		) ;
	} ) ;
} ;



ObjectNode.prototype.patchDocument = function patchDocument( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , key , prefix , hookContext ;
	
	if ( ! context.beforeModifyDone )
	{
		if ( pathParts.length )
		{
			context.documentPatch = {} ;
			prefix = pathParts[ 0 ].identifier + '.' ;
			
			for ( key in incomingDocument )
			{
				context.documentPatch[ prefix + key ] = incomingDocument[ key ] ;
			}
		}
		else
		{
			context.documentPatch = incomingDocument ;
		}
		
		
		// Do not modify the parent in a PATCH request
		delete context.documentPatch.$id ;
		delete context.documentPatch.parent ;
		delete context.documentPatch['parent.id'] ;
		delete context.documentPatch['parent.collection'] ;
		
		
		if ( this.collectionNode.beforeModifyHook )
		{
			hookContext = {
				input: context.input ,
				output: context.output ,
				//method: 'patch' ,
				existing: self.object ,
				incomingPatch: context.documentPatch ,
				//pathParts: pathParts ,
				//attachmentStreams: attachmentStreams ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				//app: self.app ,
				collectionNode: self.collectionNode ,
				objectNode: self
			} ;
			
			this.collectionNode.beforeModifyHook( hookContext , function( error ) {
				if ( error ) { callback( error ) ; return ; }
				context.beforeModifyDone = true ;
				self.patchDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			} ) ;
			
			return ;
		}
	}
	
	
	self.object.$.patch( context.documentPatch ) ;
	
	self.object.$.commit( { attachmentStreams: attachmentStreams } , function( error ) {
		if ( error ) { callback( self.transformError( error ) ) ; return ; }
		//callback( undefined , {} , {} ) ;
		
		if ( ! self.collectionNode.afterModifyHook )
		{
			callback( undefined , {} , {} ) ;
			return ;
		}
		
		hookContext = {
			input: context.input ,
			output: context.output ,
			//method: 'patch' ,
			document: self.object ,
			//pathParts: pathParts ,
			//attachmentStreams: attachmentStreams ,	// useless: already consumed
			//performer: context.input.performer ,
			//query: context.input.query ,
			//app: self.app ,
			collectionNode: self.collectionNode ,
			objectNode: self
		} ;
		
		self.collectionNode.afterModifyHook( hookContext , function( error ) {
			if ( error ) { callback( error ) ; return ; }
			callback( undefined , {} , {} ) ;
		} ) ;
	} ) ;
} ;



ObjectNode.prototype.patchLink = function patchLink( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this ;
	
	// We cannot really use the CollectionNode#patch(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.
	self.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		if ( document instanceof rootsDb.Attachment )
		{
			// It's an attachment, it cannot be patched
			callback( ErrorStatus.badRequest( { message: 'Cannot perform a PATCH on/through an Attachment.' } ) ) ;
			return ;
		}
		
		var collection = self.app.collectionNodes[ document.$.collection.name ] ;
		// we instanciate an objectNode to query
		var objectNode = collection.createObjectNode( document , [ self.app.root ] ) ;
		
		objectNode._patch(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
			} ,
			callback
		) ;
	} ) ;
} ;



ObjectNode.prototype._delete = function _objectNodeDelete( pathParts , context , callback )
{
	var self = this , nextPath , nextCollection , documentPatch , linkDetails ;
	
	if ( pathParts.length === 0 )
	{
		// If we are here, we are about to DELETE an existing object
		
		if ( ! this.collectionNode )
		{
			callback( ErrorStatus.forbidden( { message: "Cannot DELETE a static node." } ) ) ;
			return ;
		}
		
		// Check access
		restQuery.Node.checkAccess( context.input.performer , 'delete' , 1 , self.object , self.ancestors , function( error ) {
			if ( error ) { callback( error ) ; return ; }
			self.deleteDocument( pathParts , context , callback ) ;
		} ) ;
		
		return ;
	}
	
	// The next and final node is a property node, transform that into a PATCH request
	if ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' )
	{
		documentPatch = {} ;
		documentPatch[ pathParts[ 0 ].identifier ] = undefined ;
		this._patch( [] , documentPatch , null , context , callback ) ;
		return ;
	}
	
	
	// Pass through that object!
	
	// Check access
	restQuery.Node.checkAccess( context.input.performer , 'traverse' , 1 , self.object , self.ancestors , function( error ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		
		switch ( pathParts[ 0 ].type )
		{
			case 'collection':
				if ( ! self.children[ pathParts[ 0 ].identifier ] )
				{
					callback( ErrorStatus.notFound( { message: "Collection '" + pathParts[ 0 ].identifier + "' not found." } ) ) ;
					return ;
				}
				
				nextPath = pathParts.slice( 1 ) ;
				nextCollection = pathParts[ 0 ].identifier ;
				
				break ;
			
			case 'id':
			case 'slugId':
				if ( ! self.autoCollection || ! self.children[ self.autoCollection ] )
				{
					callback( ErrorStatus.notFound( { message: "No auto collection on this item." } ) ) ;
					return ;
				}
				
				nextPath = pathParts ;
				nextCollection = self.autoCollection ;
				
				break ;
			
			case 'linkProperty':
				
				if ( ! self.object.$ )
				{
					callback( ErrorStatus.badRequest( { message: 'No link property on a static node.' } ) ) ;
					return ;
				}
				
				// If there is only one part left, then it's a deleteLink request
				if ( pathParts.length === 1 )
				{
					self.deleteLink( pathParts , context , callback ) ;
					return ;
				}
				
				// ... else, we just pass through
				
				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				self.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , function( error , document ) {
					
					if ( error ) { callback( error ) ; return ; }
					
					if ( document instanceof rootsDb.Attachment )
					{
						// It's an attachment, send back the readable stream, with its meta-data
						document.getReadStream( function( error , readStream ) {
							if ( error ) { callback( error ) ; return ; }
							callback( undefined , readStream , document ) ;
						} ) ;
						
						return ;
					}
					
					var collection = self.app.collectionNodes[ document.$.collection.name ] ;
					// we instanciate an objectNode to query
					var objectNode = collection.createObjectNode( document , [ self.app.root ] ) ;
					
					objectNode._delete(
						pathParts.slice( 1 ) ,
						{
							intput: context.input ,
							output: context.output ,
							//performer: context.input.performer ,
							//query: context.input.query ,
						} ,
						callback
					) ;
				} ) ;
				
				return ;
			
			case 'multiLinkProperty':
				
				if ( ! self.object.$ )
				{
					callback( ErrorStatus.badRequest( { message: 'No multi-link property on a static node.' } ) ) ;
					return ;
				}
				
				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				linkDetails = self.object.$.getLinkDetails( pathParts[ 0 ].identifier ) ;
					
				if ( ! linkDetails )
				{
					callback( ErrorStatus.badRequest( { message: 'Multi-link not found.' } ) ) ;
					return ;
				}
				
				self.app.collectionNodes[ linkDetails.foreignCollection ]._delete(
					pathParts.slice( 1 ) ,
					{
						intput: context.input ,
						output: context.output ,
						//performer: context.input.performer ,
						//query: context.input.query ,
						batchOf: linkDetails.foreignIds ,
						linker: self ,
						linkerPath: pathParts[ 0 ].identifier ,
						parentObjectNode: self.app.root
					} ,
					callback
				) ;
				
				return ;
				
			default:
				callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
				return ;
		}
		
		
		// Process the child collection
		self.children[ nextCollection ]._delete(
			nextPath ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				parentObjectNode: self
			} ,
			callback
		) ;
	} ) ;
} ;



ObjectNode.prototype.deleteDocument = function deleteDocument( pathParts , context , callback )
{
	var self = this , hookContext ;
	
	if ( ! context.beforeDeleteDone )
	{
		if ( this.collectionNode.beforeDeleteHook )
		{
			hookContext = {
				input: context.input ,
				output: context.output ,
				//method: 'delete' ,
				existing: self.object ,
				//pathParts: pathParts ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				//app: self.app ,
				collectionNode: self.collectionNode ,
				objectNode: self
			} ;
			
			this.collectionNode.beforeDeleteHook( hookContext , function( error ) {
				if ( error ) { callback( error ) ; return ; }
				context.beforeDeleteDone = true ;
				self.deleteDocument( pathParts , context , callback ) ;
			} ) ;
			
			return ;
		}
	}
	
	// /!\ Should delete all children too!!! /!\
	
	self.object.$.delete( function( error ) {
		
		if ( error ) { callback( self.transformError( error ) ) ; return ; }
		//callback( undefined , {} , {} ) ;
		
		var idStr ;
		
		var hook = function() {
			if ( ! self.collectionNode.afterDeleteHook )
			{
				callback( undefined , {} , {} ) ;
				return ;
			}
			
			hookContext = {
				input: context.input ,
				output: context.output ,
				//method: 'delete' ,
				deleted: self.object ,
				//pathParts: pathParts ,
				//attachmentStreams: attachmentStreams ,	// useless: already consumed
				//performer: context.input.performer ,
				//query: context.input.query ,
				//app: self.app ,
				collectionNode: self.collectionNode ,
				objectNode: self	// /!\ Does it make sense?
			} ;
			
			self.collectionNode.afterDeleteHook( hookContext , function( error ) {
				if ( error ) { callback( error ) ; return ; }
				callback( undefined , {} , {} ) ;
			} ) ;
		} ;
		
		if ( context.batchOf )
		{
			// batchOf is a ref to the actual array of link
			idStr = self.object._id.toString() ;
			
			context.batchOf = context.batchOf.splice(  context.batchOf.findIndex( element => element.toString() === idStr )  ,  1  ) ;
			context.linker.object.$.stage( context.linkerPath ) ;
			
			context.linker.object.$.commit( function( error ) {
				// Send 201 anyway?
				if ( error ) { callback( error , {} , {} ) ; return ; }
				
				hook() ;
			} ) ;
		}
		else
		{
			hook() ;
		}
	} ) ;
} ;



// Unlink and delete the target
// /!\ Obsolete? Replace it by deleteDocument()? (deleteDocument() is already used for deleting a link from a multi-link).
ObjectNode.prototype.deleteLink = function deleteLink( pathParts , context , callback )
{
	var self = this ;
	
	// We cannot really use the CollectionNode#delete(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.
	self.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		if ( document instanceof rootsDb.Attachment )
		{
			// It's an attachment, delete it's meta-data property
			// This will delete the file on HD
			self.object.$.setLink( pathParts[ 0 ].identifier , null ) ;
			self.object.$.stage( pathParts[ 0 ].identifier ) ;
			
			self.object.$.commit( function( error ) {
				if ( error ) { callback( self.transformError( error ) ) ; return ; }
				callback( undefined , {} , {} ) ;
			} ) ;
			return ;
		}
		
		var collection = self.app.collectionNodes[ document.$.collection.name ] ;
		// we instanciate an objectNode to query
		var objectNode = collection.createObjectNode( document , [ self.app.root ] ) ;
		
		objectNode._delete(
			pathParts.slice( 1 ) ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
			} ,
			callback
		) ;
	} ) ;
} ;



