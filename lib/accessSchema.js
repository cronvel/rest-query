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



const inheritanceAccessSchema = {
	type: 'strictObject' ,
	optional: true ,
	properties: {
		depth: { type: 'number' , default: 1 } ,
		traverse: { type: 'boolean' , optional: true } ,
		read: { type: 'array' , of: { type: 'string' } , sanitize: 'toArray' , optional: true } ,
		write: { type: 'array' , of: { type: 'string' } , sanitize: 'toArray' , optional: true } ,
		overwrite: { type: 'boolean' , optional: true } ,
		delete: { type: 'boolean' , optional: true } ,
		create: { type: 'boolean' , optional: true } ,
	}
} ;



const accessSchema = {
	type: 'strictObject' ,
	sanitize: 'restQuery.toAccess' ,
	tier: 4 ,
	default: { traverse: true , read: [ 'content' ] , create: true } ,
	properties: {
		traverse: { type: 'boolean' , optional: true } ,
		read: { type: 'array' , of: { type: 'string' } , sanitize: 'toArray' , optional: true } ,
		write: { type: 'array' , of: { type: 'string' } , sanitize: 'toArray' , optional: true } ,
		overwrite: { type: 'boolean' , optional: true } ,
		delete: { type: 'boolean' , optional: true } ,
		create: { type: 'boolean' , optional: true } ,
		inheritance: inheritanceAccessSchema
	}
} ;



module.exports = accessSchema ;

