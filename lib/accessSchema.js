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



const inheritanceAccessSchema = {
	type: 'strictObject' ,
	optional: true ,
	properties: {
		depth: { type: 'number' , default: 1 } ,
		traverse: { type: 'boolean' , optional: true } ,
		read: { type: 'restQuery.accessDetail' , sanitize: 'restQuery.toAccessDetail' , optional: true } ,
		write: { type: 'restQuery.accessDetail' , sanitize: 'restQuery.toAccessDetail' , optional: true } ,
		overwrite: { type: 'boolean' , optional: true } ,
		delete: { type: 'boolean' , optional: true } ,
		create: { type: 'boolean' , optional: true }
	}
} ;



const collectionAccessSchema = {
	type: 'strictObject' ,
	sanitize: 'restQuery.toCollectionAccess' ,
	tags: [ 'access' ] ,
	default: { traverse: true , create: true } ,
	properties: {
		// Traverse sort of overide the parent-object's traverse value
		traverse: { type: 'boolean' , optional: true } ,
		// Read could mean list all items. ATM it is always possible if traverse is true, filtering is done per-object
		//read: { type: 'restQuery.accessDetail' , sanitize: 'restQuery.toAccessDetail' , optional: true } ,
		// Write/overwrite has no sense ATM, since we cannot PUT/PATCH/DELETE on a collection
		//write: { type: 'restQuery.accessDetail' , sanitize: 'restQuery.toAccessDetail' , optional: true } ,
		//overwrite: { type: 'boolean' , optional: true } ,
		//delete: { type: 'boolean' , optional: true } ,
		// Create sort of overide the parent-object's create value
		create: { type: 'boolean' , optional: true } ,
		// Inheritance sort of overide the parent-object's inheritance value
		inheritance: inheritanceAccessSchema
	}
} ;



const accessSchema = {
	type: 'strictObject' ,
	sanitize: 'restQuery.toAccess' ,
	tags: [ 'access' ] ,
	default: { traverse: true , read: [ 'id' , 'content' ] , create: true } ,
	properties: {
		traverse: { type: 'boolean' , optional: true } ,
		read: { type: 'restQuery.accessDetail' , sanitize: 'restQuery.toAccessDetail' , optional: true } ,
		write: { type: 'restQuery.accessDetail' , sanitize: 'restQuery.toAccessDetail' , optional: true } ,
		overwrite: { type: 'boolean' , optional: true } ,
		delete: { type: 'boolean' , optional: true } ,
		create: { type: 'boolean' , optional: true } ,
		collection: {
			type: 'strictObject' ,
			optional: true ,
			of: collectionAccessSchema
		} ,
		inheritance: inheritanceAccessSchema
	}
} ;



module.exports = accessSchema ;

