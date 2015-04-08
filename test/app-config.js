/*
	The Cedric's Swiss Knife (CSK) - CSK REST Query test suite

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

/*
	This config is shared between restQuery-test.js and app-http-request-handler-test.js
*/



exports.descriptors = {} ;



exports.descriptors.blogs = {
	url: 'mongodb://localhost:27017/restQuery/blogs' ,
	properties: {
		//title: { constraint: 'string' } , // already defined by restQuery
		description: { constraint: 'string' },
		embedded: { constraint: 'object' }	// just for the test
	} ,
	meta: {
	} ,
	indexes: [
	] ,
	hooks: {
	} ,
	useMemProxy: false
} ;



exports.descriptors.posts = {
	url: 'mongodb://localhost:27017/restQuery/posts' ,
	properties: {
		//title: { constraint: 'string' } ,	// already defined by restQuery
		content: { constraint: 'string' }
	} ,
	meta: {
	} ,
	indexes: [
	] ,
	hooks: {
	} ,
	useMemProxy: false
} ;



exports.descriptors.comments = {
	url: 'mongodb://localhost:27017/restQuery/comments' ,
	properties: {
		content: { constraint: 'string' }
	} ,
	meta: {
	} ,
	indexes: [
	] ,
	hooks: {
	} ,
	useMemProxy: false
} ;



exports.descriptors.users = {
	url: 'mongodb://localhost:27017/restQuery/users' ,
	properties: {
		firstName: { constraint: 'string' } ,
		lastName: { constraint: 'string' }
	} ,
	meta: {
	} ,
	indexes: [
	] ,
	hooks: {
	} ,
	useMemProxy: false
} ;



exports.descriptors.auth = {
	url: 'mongodb://localhost:27017/restQuery/auth' ,
	properties: {
	} ,
	meta: {
	} ,
	indexes: [
	] ,
	hooks: {
	} ,
	useMemProxy: false
} ;
