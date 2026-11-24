// router/Router.js
import React from 'react';
import Page1_Dashboard from '../view/pages/Page1_Dashboard';
import Page2_Wedstrijden from '../view/pages/Page2_Wedstrijden';
import Page3_Spelers from '../view/pages/Page3_Spelers';
import Page4_Statistieken from '../view/pages/Page4_Statistieken';
import Page5_LiveWedstrijd from '../view/pages/Page5_LiveWedstrijd';

export const SubformRouter = ({ controller, currentUser }) => {
  switch (controller.currentRoute) {
    case 'Page1':
      return <Page1_Dashboard controller={controller} currentUser={currentUser} />;
    case 'Page2':
      return <Page2_Wedstrijden controller={controller} currentUser={currentUser} />;
    case 'Page3':
      return <Page3_Spelers controller={controller} currentUser={currentUser} />;
    case 'Page4':
      return <Page4_Statistieken controller={controller} currentUser={currentUser} />;
    case 'Page5':
      return <Page5_LiveWedstrijd controller={controller} currentUser={currentUser} />;
    default:
      return <Page1_Dashboard controller={controller} currentUser={currentUser} />;
  }
};