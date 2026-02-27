Rails.application.routes.draw do
  resources :records, only: [ :new, :create ] do
    collection do
      get :latest
    end
  end

  root "records#new"

  get "up" => "rails/health#show", as: :rails_health_check
end
