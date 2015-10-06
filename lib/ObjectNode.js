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



ObjectNode.create = function createObjectNode( app , collectionNode , object , objectNode )
{
	var id , autoCollection ;
	
	if ( ! objectNode ) { objectNode = Object.create( restQuery.ObjectNode.prototype ) ; }
	
	if ( collectionNode )
	{
		restQuery.Node.create( app , objectNode , collectionNode.children ) ;
		autoCollection = collectionNode.autoCollection ;
		
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
		autoCollection = app.autoCollection ;
		//console.log( "app.autoCollection" , app.autoCollection , app ) ;
	}
	
	Object.defineProperties( objectNode , {
		collectionNode: { value: collectionNode , enumerable: true } ,
		autoCollection: { value: autoCollection , enumerable: true } ,
		object: { value: object , enumerable: true } ,
		id: { value: id , enumerable: true }
	} ) ;
	
	return objectNode ;
} ;



ObjectNode.prototype._get = function _objectNodeGet( pathParts , context , callback )
{
	var self = this , nextPath , nextCollection , exported ;
	
	if ( pathParts.length === 0 || ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) )
	{
		// Get that object!
		
		// Check access
		restQuery.Node.checkAccess( {
				access: 'read' ,
				object: self.object ,
				ancestorObjectNodes: context.ancestorObjectNodes ,
				performer: context.performer
			} ,
			function( error ) {
				
				if ( error ) { callback( error ) ; return ; }
				
				
				//exported = doormen.mask( self.collectionNode.collection.documentSchema , self.object , { tier: 2 , schemaDefaultTier: 2 } ) ;
				//console.log( "exported:" , exported ) ;
				
				if ( pathParts.length )
				{
					callback( undefined , tree.path.get( self.object , pathParts[ 0 ].identifier ) , {} ) ;
					//callback( undefined , tree.path.get( exported , pathParts[ 0 ].identifier ) , {} ) ;
				}
				else
				{
					callback( undefined , self.object , {} ) ;
					//callback( undefined , exported , {} ) ;
				}
			}
		) ;
		
		return ;
	}
	
	
	// Pass through that object!
	
	// Check access
	restQuery.Node.checkAccess( {
			access: 'passThrough' ,
			object: self.object ,
			ancestorObjectNodes: context.ancestorObjectNodes ,
			performer: context.performer
		} ,
		function( error ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			//# debug : console.log( "pathParts[ 0 ]:" , pathParts[ 0 ] ) ;
			//# debug : console.log( "children:" , self.children ) ;
			
			switch ( pathParts[ 0 ].type )
			{
				case 'collection':
					if ( ! self.children[ pathParts[ 0 ].identifier ] )
					{
						callback( ErrorStatus.notFound( { message: "Collection '" + pathParts[ 0 ] + "' not found." } ) ) ;
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
					self.object.$.getLink( pathParts[ 0 ].identifier , function( error , document ) {
						
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
						var objectNode = collection.createObjectNode( document ) ;
						
						var rootNode = self.app.root ;
						
						objectNode._get(
							pathParts.slice( 1 ) ,
							{
								performer: context.performer ,
								query: context.query ,
								parentNode: rootNode ,
								ancestorObjectNodes: [ rootNode ]
							} ,
							callback
						) ;
					} ) ;
					
					return ;
				
				default:
					callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
					return ;
			}
			
			
			// Process the child collection
			self.children[ nextCollection ]._get(
				nextPath ,
				{
					performer: context.performer ,
					query: context.query ,
					parentNode: self ,
					ancestorObjectNodes: context.ancestorObjectNodes ? [ self ].concat( context.ancestorObjectNodes ) : [ self ]
				} ,
				callback
			) ;
		} 
	) ;
} ;



ObjectNode.prototype._post = function _objectNodePost( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , nextPath , nextCollection ;
	
	if ( pathParts.length === 0 || ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a POST on an object node or property node' } ) ) ;
		return ;
	}
	
	// Pass through that object!
	
	// Check access
	restQuery.Node.checkAccess( {
			access: 'passThrough' ,
			object: self.object ,
			ancestorObjectNodes: context.ancestorObjectNodes ,
			performer: context.performer
		} ,
		function( error ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			//# debug : console.log( "pathParts[ 0 ]:" , pathParts[ 0 ] ) ;
			//# debug : console.log( "children:" , self.children ) ;
			
			
			
			switch ( pathParts[ 0 ].type )
			{
				case 'collection':
					if ( ! self.children[ pathParts[ 0 ].identifier ] )
					{
						callback( ErrorStatus.notFound( { message: "Collection '" + pathParts[ 0 ] + "' not found." } ) ) ;
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
					self.object.$.getLink( pathParts[ 0 ].identifier , function( error , document ) {
						
						if ( error ) { callback( error ) ; return ; }
						
						if ( document instanceof rootsDb.Attachment )
						{
							// It's an attachment, send back the readable stream, with its meta-data
							callback( ErrorStatus.badRequest( { message: 'Cannot perform a POST on/through an Attachment.' } ) ) ;
							return ;
						}
						
						var collection = self.app.collectionNodes[ document.$.collection.name ] ;
						// we instanciate an objectNode to query
						var objectNode = collection.createObjectNode( document ) ;
						
						var rootNode = self.app.root ;
						
						objectNode._post(
							pathParts.slice( 1 ) ,
							incomingDocument ,
							attachmentStreams ,
							{
								performer: context.performer ,
								query: context.query ,
								parentNode: rootNode ,
								ancestorObjectNodes: [ rootNode ]
							} ,
							callback
						) ;
					} ) ;
					
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
					performer: context.performer ,
					query: context.query ,
					parentNode: self ,
					ancestorObjectNodes: context.ancestorObjectNodes ? [ self ].concat( context.ancestorObjectNodes ) : [ self ]
				} ,
				callback
			) ;
		}
	) ;
} ;



// If this method is called, it means that the object *EXISTS*,
// PUT on an unexistant object is performed at collection-level.
ObjectNode.prototype._put = function _objectNodePut( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , nextPath , nextCollection , patchDocument ;
	
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
		restQuery.Node.checkAccess( {
				access: 'readCreateModify' ,
				object: self.object ,
				ancestorObjectNodes: context.ancestorObjectNodes ,
				performer: context.performer
			} ,
			function( error ) {
				
				if ( error ) { callback( error ) ; return ; }
				
				incomingDocument.parent = {
					collection: context.parentNode.collectionNode && context.parentNode.collectionNode.name ,
					id: context.parentNode.id
				} ;
				
				// Keep $id
				incomingDocument.$id = self.id ;
				
				// If no slug is provided, keep the current slug
				if ( ! incomingDocument.slugId ) { incomingDocument.slugId = self.object.slugId ; }
				
				try {
					self.collectionNode.collection.createDocument( incomingDocument ) ;
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
						callback( ErrorStatus.badRequest( { message: error.toString() } ) ) ;
					}
					return ;
				}
				
				incomingDocument.$.save( {
					overwrite: true ,
					clearAttachments: true ,	// We are replacing an object, so we need to clear attachments first
					attachmentStreams: attachmentStreams
					} , function( error ) {
						if ( error ) { callback( error ) ; return ; }
						callback( undefined , {} , { status: 200 } ) ;
					}
				) ;
			}
		) ;
		
		return ;
	}
	
	// The next and final node is a property node, transform that into a PATCH request
	if ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' )
	{
		patchDocument = {} ;
		patchDocument[ pathParts[ 0 ].identifier ] = incomingDocument ;
		this._patch( [] , patchDocument , attachmentStreams , context , callback ) ;
		return ;
	}
	
	
	// Pass through that object!
	
	// Check access
	restQuery.Node.checkAccess( {
			access: 'passThrough' ,
			object: self.object ,
			ancestorObjectNodes: context.ancestorObjectNodes ,
			performer: context.performer
		} ,
		function( error ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			//# debug : console.log( "pathParts[ 0 ]:" , pathParts[ 0 ] ) ;
			//# debug : console.log( "children:" , self.children ) ;
			
			
			
			switch ( pathParts[ 0 ].type )
			{
				case 'collection':
					if ( ! self.children[ pathParts[ 0 ].identifier ] )
					{
						callback( ErrorStatus.notFound( { message: "Collection '" + pathParts[ 0 ] + "' not found." } ) ) ;
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
					
					// We cannot really use the CollectionNode#put(), because we are not in the standard RestQuery way
					// of doing things, there is no ancestry link here, so we will just start from a brand new object
					// without any relationship with the former object.
					self.object.$.getLink( pathParts[ 0 ].identifier , function( error , document ) {
						
						var collection , objectNode , details , rootNode = self.app.root ;
						
						if ( error )
						{
							if ( error.type === 'notFound' && pathParts.length === 1 )
							{
								// This is a normal case: the target does not exist yet,
								// and should be created by the request
								
								details = self.object.$.getLinkDetails( pathParts[ 0 ].identifier ) ;
								
								if ( details.type === 'attachment' )
								{
									/*
									// It's an attachment, send back the readable stream, with its meta-data
									callback( new Error( 'Not implemented yet.' ) ) ;
									return ;
									*/
									self.object.$.commit( { attachmentStreams: attachmentStreams } , function( error ) {
										if ( error ) { callback( error ) ; return ; }
										callback( undefined , {} , {} ) ;
									} ) ;
									return ;
								}
								else if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) )
								{
									callback( ErrorStatus.badRequest( { message: "The body of a PUT request, creating a new document, should be a strict Object." } ) ) ;
									return ;
								}
								
								
								collection = self.app.collectionNodes[ details.collection ].collection ;
								
								async.parallel( [
									function( asyncCallback ) {
										restQuery.Node.checkAccess( {
												access: 'readCreateModify' ,
												object: self.object ,
												ancestorObjectNodes: context.ancestorObjectNodes ,
												performer: context.performer
											} , asyncCallback ) ;
									} ,
									function( asyncCallback ) {
										restQuery.Node.checkAccess( {
												access: 'readCreate' ,
												object: rootNode.object ,
												//ancestorObjectNodes: [ rootNode ] ,
												performer: context.performer
											} , asyncCallback ) ;
									}
								] )
								.exec( function( error ) {
										
									if ( error ) { callback( error ) ; return ; }
									
									var id ;
									
									incomingDocument.parent = {
										collection: null ,
										id: '/'
									} ;
									
									id = incomingDocument.$id = collection.createId( incomingDocument ) ;
									
									try {
										collection.createDocument( incomingDocument ) ;
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
											callback( ErrorStatus.badRequest( { message: error.toString() } ) ) ;
										}
										return ;
									}
									
									incomingDocument.$.save( function( error ) {
										if ( error ) { callback( error ) ; return ; }
										
										self.object.$.setLink( pathParts[ 0 ].identifier , incomingDocument ) ;
										
										self.object.$.save( function( error ) {
											if ( error ) { callback( error ) ; return ; }
											callback( undefined , { id: id } , { status: 201 } ) ;
										} ) ;
									} ) ;
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
							/*
							// It's an attachment, send back the readable stream, with its meta-data
							callback( new Error( 'Not implemented yet.' ) ) ;
							//self.object.saveAttachment
							return ;
							*/
							self.object.$.commit( { attachmentStreams: attachmentStreams } , function( error ) {
								if ( error ) { callback( error ) ; return ; }
								callback( undefined , {} , {} ) ;
							} ) ;
							return ;
						}
						
						collection = self.app.collectionNodes[ document.$.collection.name ] ;
						
						// we instanciate an objectNode to query
						objectNode = collection.createObjectNode( document ) ;
						
						objectNode._put(
							pathParts.slice( 1 ) ,
							incomingDocument ,
							attachmentStreams ,
							{
								performer: context.performer ,
								query: context.query ,
								parentNode: rootNode ,
								ancestorObjectNodes: [ rootNode ]
							} ,
							callback
						) ;
					} ) ;
					
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
					performer: context.performer ,
					query: context.query ,
					parentNode: self ,
					ancestorObjectNodes: context.ancestorObjectNodes ? [ self ].concat( context.ancestorObjectNodes ) : [ self ]
				} ,
				callback
			) ;
		}
	) ;
} ;



ObjectNode.prototype._patch = function _objectNodePatch( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , key , nextPath , nextCollection , patchDocument , prefix ;
	
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
		restQuery.Node.checkAccess( {
				access: 'readCreateModify' ,
				object: self.object ,
				ancestorObjectNodes: context.ancestorObjectNodes ,
				performer: context.performer
			} ,
			function( error ) {
				
				if ( error ) { callback( error ) ; return ; }
				
				if ( pathParts.length )
				{
					patchDocument = {} ;
					prefix = pathParts[ 0 ].identifier + '.' ;
					
					for ( key in incomingDocument )
					{
						patchDocument[ prefix + key ] = incomingDocument[ key ] ;
					}
				}
				else
				{
					patchDocument = incomingDocument ;
				}
				
				//console.log( '>>> ' , patchDocument ) ;
				
				// Do not modify the parent in a PATCH request
				delete patchDocument.$id ;
				delete patchDocument.parent ;
				delete patchDocument['parent.id'] ;
				delete patchDocument['parent.collection'] ;
				
				self.object.$.patch( patchDocument ) ;
				
				//console.log( 'patch: ' , string.inspect( { style: 'color' , proto: true } , self.object ) ) ;
				
				self.object.$.commit( { attachmentStreams: attachmentStreams } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback( undefined , {} , {} ) ;
				} ) ;
			}
		) ;
		
		return ;
	}
	
	// Pass through that object!
	
	// Check access
	restQuery.Node.checkAccess( {
			access: 'passThrough' ,
			object: self.object ,
			ancestorObjectNodes: context.ancestorObjectNodes ,
			performer: context.performer
		} ,
		function( error ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			//# debug : console.log( "pathParts[ 0 ]:" , pathParts[ 0 ] ) ;
			//# debug : console.log( "children:" , self.children ) ;
			
			
			
			switch ( pathParts[ 0 ].type )
			{
				case 'collection':
					if ( ! self.children[ pathParts[ 0 ].identifier ] )
					{
						callback( ErrorStatus.notFound( { message: "Collection '" + pathParts[ 0 ] + "' not found." } ) ) ;
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
					
					// We cannot really use the CollectionNode#patch(), because we are not in the standard RestQuery way
					// of doing things, there is no ancestry link here, so we will just start from a brand new object
					// without any relationship with the former object.
					self.object.$.getLink( pathParts[ 0 ].identifier , function( error , document ) {
						
						if ( error ) { callback( error ) ; return ; }
						
						if ( document instanceof rootsDb.Attachment )
						{
							// It's an attachment, send back the readable stream, with its meta-data
							callback( ErrorStatus.badRequest( { message: 'Cannot perform a PATCH on/through an Attachment.' } ) ) ;
							return ;
						}
						
						var collection = self.app.collectionNodes[ document.$.collection.name ] ;
						// we instanciate an objectNode to query
						var objectNode = collection.createObjectNode( document ) ;
						
						var rootNode = self.app.root ;
						
						objectNode._patch(
							pathParts.slice( 1 ) ,
							incomingDocument ,
							attachmentStreams ,
							{
								performer: context.performer ,
								query: context.query ,
								parentNode: rootNode ,
								ancestorObjectNodes: [ rootNode ]
							} ,
							callback
						) ;
					} ) ;
					
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
					performer: context.performer ,
					query: context.query ,
					parentNode: self ,
					ancestorObjectNodes: context.ancestorObjectNodes ? [ self ].concat( context.ancestorObjectNodes ) : [ self ]
				} ,
				callback
			) ;
		}
	) ;
} ;



ObjectNode.prototype._delete = function _objectNodeDelete( pathParts , context , callback )
{
	var self = this , nextPath , nextCollection , patchDocument ;
	
	if ( pathParts.length === 0 )
	{
		// If we are here, we are about to DELETE an existing object
		
		if ( ! this.collectionNode )
		{
			callback( ErrorStatus.forbidden( { message: "Cannot DELETE a static node." } ) ) ;
			return ;
		}
		
		// Check access
		restQuery.Node.checkAccess( {
				access: 'all' ,
				object: self.object ,
				ancestorObjectNodes: context.ancestorObjectNodes ,
				performer: context.performer
			} ,
			function( error ) {
				
				if ( error ) { callback( error ) ; return ; }
				
				self.object.$.delete( function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback( undefined , {} , {} ) ;
				} ) ;
			}
		) ;
		
		return ;
	}
	
	// The next and final node is a property node, transform that into a PATCH request
	if ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' )
	{
		patchDocument = {} ;
		patchDocument[ pathParts[ 0 ].identifier ] = undefined ;
		this._patch( [] , patchDocument , null , context , callback ) ;
		return ;
	}
	
	
	// Pass through that object!
	
	// Check access
	restQuery.Node.checkAccess( {
			access: 'passThrough' ,
			object: self.object ,
			ancestorObjectNodes: context.ancestorObjectNodes ,
			performer: context.performer
		} ,
		function( error ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			//# debug : console.log( "pathParts[ 0 ]:" , pathParts[ 0 ] ) ;
			//# debug : console.log( "children:" , self.children ) ;
			
			switch ( pathParts[ 0 ].type )
			{
				case 'collection':
					if ( ! self.children[ pathParts[ 0 ].identifier ] )
					{
						callback( ErrorStatus.notFound( { message: "Collection '" + pathParts[ 0 ] + "' not found." } ) ) ;
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
					
					// We cannot really use the CollectionNode#delete(), because we are not in the standard RestQuery way
					// of doing things, there is no ancestry link here, so we will just start from a brand new object
					// without any relationship with the former object.
					self.object.$.getLink( pathParts[ 0 ].identifier , function( error , document ) {
						
						if ( error ) { callback( error ) ; return ; }
						
						if ( document instanceof rootsDb.Attachment )
						{
							// It's an attachment, delete it's meta-data property
							// This will delete the file on HD
							self.object.$.setLink( pathParts[ 0 ].identifier , null ) ;
							self.object.$.stage( pathParts[ 0 ].identifier ) ;
							
							//console.log( 'patch: ' , string.inspect( { style: 'color' , proto: true } , self.object ) ) ;
							
							self.object.$.commit( function( error ) {
								if ( error ) { callback( error ) ; return ; }
								callback( undefined , {} , {} ) ;
							} ) ;
							return ;
						}
						
						var collection = self.app.collectionNodes[ document.$.collection.name ] ;
						// we instanciate an objectNode to query
						var objectNode = collection.createObjectNode( document ) ;
						
						var rootNode = self.app.root ;
						
						objectNode._delete(
							pathParts.slice( 1 ) ,
							{
								performer: context.performer ,
								query: context.query ,
								parentNode: rootNode ,
								ancestorObjectNodes: [ rootNode ]
							} ,
							callback
						) ;
					} ) ;
					
					return ;
					
				default:
					callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
					return ;
			}
			
			
			// Process the child collection
			self.children[ nextCollection ]._delete(
				nextPath ,
				{
					performer: context.performer ,
					query: context.query ,
					parentNode: self ,
					ancestorObjectNodes: context.ancestorObjectNodes ? [ self ].concat( context.ancestorObjectNodes ) : [ self ]
				} ,
				callback
			) ;
		}
	) ;
} ;



