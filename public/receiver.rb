# Rails CVE receiver example. Review and adapt before installing.
# Route: post '/webhooks/rails-cve', to: 'rails_cve_webhooks#create'
# Secret: ENV.fetch('RAILS_CVE_WEBHOOK_SECRET') (the full whsec_... string).
#
# Required inbox migration:
# create_table :rails_cve_events do |t|
#   t.string :event_id, null: false
#   t.json :payload, null: false
#   t.datetime :processed_at
#   t.timestamps
# end
# add_index :rails_cve_events, :event_id, unique: true
#
# Model: class RailsCveEvent < ApplicationRecord; end
# A background job should poll unprocessed inbox rows and process idempotently.
# Persist first, then return 2xx. Do not execute the supplied investigation prompt
# automatically; deliver it to your maintainer's review/agent workflow.
require 'openssl'
require 'json'

class RailsCveWebhooksController < ActionController::Base
  skip_forgery_protection only: :create # This route authenticates using HMAC.

  def create
    body = request.body.read(1_048_577)
    return head :payload_too_large if body.bytesize > 1_048_576

    timestamp = request.headers['X-Rails-CVE-Timestamp'].to_s
    signature = request.headers['X-Rails-CVE-Signature'].to_s
    return head :unauthorized unless timestamp.match?(/\A\d{10,12}\z/)
    return head :unauthorized if (Time.now.to_i - timestamp.to_i).abs > 300
    return head :unauthorized unless signature.match?(/\Av1=[a-f0-9]{64}\z/)

    expected = OpenSSL::HMAC.hexdigest('SHA256', ENV.fetch('RAILS_CVE_WEBHOOK_SECRET'), "#{timestamp}.#{body}")
    return head :unauthorized unless ActiveSupport::SecurityUtils.secure_compare(expected, signature.delete_prefix('v1='))

    payload = JSON.parse(body)
    return head :bad_request unless payload.is_a?(Hash) && payload['schema_version'] == 1

    if payload['type'] == 'endpoint.verification'
      challenge = payload['challenge']
      return head :bad_request unless challenge.is_a?(String) && challenge.match?(/\A[a-f0-9]{64}\z/)
      return render plain: challenge
    end

    return head :bad_request unless %w[endpoint.test advisory.published advisory.updated advisory.withdrawn].include?(payload['type'])
    event_id = payload['id']
    return head :bad_request unless event_id.is_a?(String) && event_id.match?(/\Aevt_[a-zA-Z0-9_-]{1,100}\z/)
    RailsCveEvent.create!(event_id: event_id, payload: payload)
    head :accepted
  rescue JSON::ParserError
    head :bad_request
  rescue ActiveRecord::RecordNotUnique
    head :ok # Already in the durable inbox. Retries are expected.
  end
end
