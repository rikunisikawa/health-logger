import { Amplify } from 'aws-amplify'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId:       import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
      loginWith: {
        oauth: {
          domain: `${import.meta.env.VITE_COGNITO_DOMAIN as string}.auth.ap-northeast-1.amazoncognito.com`,
          scopes: ['email', 'openid', 'profile'],
          redirectSignIn:  [window.location.origin],
          redirectSignOut: [window.location.origin],
          responseType: 'code',
        },
      },
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
