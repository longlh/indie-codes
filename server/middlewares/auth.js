'use strict';

var bird = require('bluebird'),
	mongoose = require('mongoose'),
	redis = require('redis'),
	uuid = require('node-uuid');

var Account = mongoose.model('Account'),
	client = redis.createClient(),
	self = module.exports;

// promisify
var rGet = bird.promisify(client.get, client),
	rSet = bird.promisify(client.set, client),
	rDel = bird.promisify(client.del, client),
	rExpire = bird.promisify(client.expire, client);

var enforceSession = function(token, account) {

	return rSet('session:' + token, account.id).then(function saveTokenDone(reply) {

		return rExpire('session:' + token, 60e3);

	}).then(function setTokenExpireDone(reply) {

		return {
			token: token,
			id: account.id
		};

	});

};

self.validateSession = function(req, res, next) {

	var token = req.params.token;

	rGet('session:' + token).then(function(id) {

		if (id) {
			var query = Account.findById(id),
				findAccount = bird.promisify(query.exec, query);

			return findAccount();
		}

		return bird.reject();

	}).then(function findAccountDone(account) {

		return enforceSession(token, account);

	}).then(function enforceSessionDone(session) {

		res.json(session);

	}).catch(function onError(e) {

		res.status(401).json(e);

	});

};

self.destroySession = function(req, res, next) {

	var token = req.params.token;

	rDel('session:' + token).finally(function done() {

		res.status(204).end();

	});
};

self.signIn = function(req, res, next) {

	var query = Account.findOne({
			email: req.body.email,
			enable: true
		}),
		findAccount = bird.promisify(query.exec, query);

	findAccount().then(function findAccountDone(account) {

		if (account && account.authenticate(req.body.password)) {
			var token = uuid.v4();

			return enforceSession(token, account);
		} else {
			return bird.reject();
		}

	}).then(function sessionEnforceDone(session) {

		res.json(session);

	}).catch(function onError(e) {

		console.log(e);

		res.status(401).json(e);

	});

};