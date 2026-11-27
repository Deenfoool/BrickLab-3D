import {defaultPortfolio} from '../../src/menu/portfolio-model.js'
// Called only in the same transaction that inserts a new user. No backfill of private accounts.
export async function createDefaultWorkshop(tx,userId){
 await tx`select set_config('bricklab.user_id', ${userId}, true)`
 const [user]=await tx`select username from bricklab.users where id=${userId}`
 const portfolio=defaultPortfolio()
 await tx`insert into bricklab.public_profiles(user_id,display_name,bio,unified,share_avatar,share_cover,portfolio,cover_theme)
 values(${userId},${user.username},'',true,true,true,${tx.json(portfolio)},'blueprint')`
}
