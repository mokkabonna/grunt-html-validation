/*
 * grunt-html-validation remote validation helper
 * https://github.com/praveen/grunt-html-validation
 *
 * Copyright (c) 2013 Praveen Vijayan
 * Licensed under the MIT license.
 */
module.exports = function remotevals (files, notify) {
	'use strict';

	var request = require('request');
	var grunt = require('grunt');

	files.forEach(function(file, index) {
		var tempname  = '_tempvalidation_'+ index +'.html';
		request(file, function (error, response, body) {
			if(response.statusCode == 404){
				grunt.warn(fileNotFound);
			}

			if (!error && response.statusCode == 200) {
				grunt.file.write(tempname, body);
				return notify(file, tempname);
			}
		})
	});


}
