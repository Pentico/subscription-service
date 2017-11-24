//
// Name:    plans.js
// Purpose: Controller and routing for Plan model
// Creator: Tom Söderlund
//

'use strict';

const _ = require('lodash');
const mongooseCrudify = require('mongoose-crudify');
const helpers = require('../../config/helpers');
const Plan = require('mongoose').model('Plan');

// Private functions

const identifyingKey = 'reference';

const servicesAsCollection = function (req, res, next) {
	const convertServices = plan => {
		plan = helpers.convertToJsonIfNeeded(plan);
		plan.services = helpers.arrayToCollection(plan.services);
		return plan;
	};

	req.crudify.result = helpers.applyToAll(convertServices, req.crudify.result);
	next();
};

const addUsersActivePlan = function (req, res, next) {
	const checkActivePlan = plan => {
		plan = helpers.convertToJsonIfNeeded(plan);
		plan.isActive = false; // TODO: replace with user subscription check
		return plan;
	};

	req.crudify.result = helpers.applyToAll(checkActivePlan, req.crudify.result);
	next();
};

const showCorrectVAT = function (req, res, next) {
	helpers.convertToJsonIfNeeded(req.crudify.result);

	const vatPercent = (process.env.VAT_PERCENT || 25) / 100;
	// TODO: make this not hardcoded
	const shouldUserPayVAT = true;

	const calculateVatAmount = (amount, percent, isIncluded, userPaysVAT) => _.round(
			userPaysVAT
				? isIncluded
					? amount * percent /* Just % of AmountWith */
					: amount / (1-percent) - amount /* AmountWith - AmountWithout */
				: 0 /* No VAT if user doesn't pay VAT */
		, 3);

	const calculatePriceAmount = (amount, percent, includedInPrice, userPaysVAT) => _.round(
			userPaysVAT
				? includedInPrice
					? amount /* Amount is included, and that's what User should see */
					: amount / (1-percent)
				: includedInPrice
					? amount * (1-percent)
					: amount /* Amount is NOT included, and that's what User should see */
		, 3);

	const calculatePlanVAT = plan => {
		helpers.convertToJsonIfNeeded(plan);
		plan.vat = {};
		_.forEach(plan.price, (amount, timeUnit) => {
			if (timeUnit !== 'vatIncluded') {
				plan.vat[timeUnit] = calculateVatAmount(amount, vatPercent, plan.price.vatIncluded, shouldUserPayVAT);
				plan.price[timeUnit] = calculatePriceAmount(amount, vatPercent, plan.price.vatIncluded, shouldUserPayVAT);
			}
		})
		return plan;
	};

	req.crudify.result = helpers.applyToAll(calculatePlanVAT, req.crudify.result);
	next();
};

const sortByPosition = function (req, res, next) {
	helpers.convertToJsonIfNeeded(req.crudify.result);
	req.crudify.result = _.sortBy(req.crudify.result, ['position']);
	next();
};

// Public API

module.exports = function (app, config) {

	app.use(
		'/api/plans',
		mongooseCrudify({
			Model: Plan,
			identifyingKey: identifyingKey,
			beforeActions: [
				{ middlewares: [helpers.changeReferenceToId.bind(this, { modelName:'Service', parentCollection:'services', childIdentifier:'reference' })], only: ['create'] },
				{ middlewares: [helpers.populateProperties.bind(this, { modelName:'plan', propertyName:'services' })], only: ['read'] },
			],
			endResponseInAction: false,
			afterActions: [
				{ middlewares: [servicesAsCollection], only: ['read'] }, // see also populateProperties above
				{ middlewares: [showCorrectVAT], only: ['list', 'read'] },
				{ middlewares: [addUsersActivePlan], only: ['list', 'read'] },
				{ middlewares: [sortByPosition], only: ['list'] },
				{ middlewares: [helpers.sendRequestResponse] },
			],
		})
	);

};