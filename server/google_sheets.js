// ------------- IMPORT & CONFIG ------------- //

// google sheets
// https://theoephraim.github.io/node-google-spreadsheet/#/
const google_auth = require('./google_oauth');
const { GoogleSpreadsheet } = require('google-spreadsheet');

// .env variables
const dotenv = require('dotenv');
dotenv.config();
const FISH_SHEETID = process.env.FISH_SHEETID;


// Persist the current fish rows to the first worksheet in the configured sheet.
async function writeStateToGSheet(state) {
  if (!FISH_SHEETID) {
    throw new Error('FISH_SHEETID must be configured before writing game state to Google Sheets.');
  }

  const serviceAccountAuth = await google_auth.getAccessTokenFromImpersonatedCredentials();
  const doc = new GoogleSpreadsheet(FISH_SHEETID, serviceAccountAuth); // pass in the access token

  await doc.loadInfo(); // loads document properties and worksheets
  const sheet = doc.sheetsByIndex[0]; // or use `doc.sheetsById[id]` or `doc.sheetsByTitle[title]`

  await sheet.loadCells('A1:E10'); // loads range of cells into local cache - DOES NOT RETURN THE CELLS
  // console.log(sheet.cellStats); // total cells, loaded, how many non-empty
  
  // // example
  // const a1 = sheet.getCell(0, 0); // access cells using a zero-based index
  // const c6 = sheet.getCellByA1('C6'); // or A1 style notation
  
  for (let i = 0; i < state.length; i++) {
      const fish = state[i];
      const row = i + 1;

      if (!fish) continue;

      const fishCell = sheet.getCell(row, 0);
      const statusCell = sheet.getCell(row, 1);
      const sizeCell = sheet.getCell(row, 2);
      const locationCell = sheet.getCell(row, 3);

      fishCell.value = fish.fish;
      statusCell.value = fish.status;
      sizeCell.value = fish.size;
      locationCell.value = fish.location;
    }

  // // access everything about the cell
  // console.log(a1.value);
  // console.log(a1.formula);
  // console.log(a1.formattedValue);

  // // update the cell contents and formatting
  // a1.value = 123.456;
  // c6.formula = '=A1';
  // a1.textFormat = { bold: true };
  // c6.note = 'This is a note!';
  await sheet.saveUpdatedCells(); // save all updates in one call
}

module.exports = {
  writeStateToGSheet
}